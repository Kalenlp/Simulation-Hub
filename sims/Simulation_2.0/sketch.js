/**
 * Artery Flow — simplified 2D particle model
 * - Artery: horizontal tube with radius R
 * - Flow: Poiseuille-like profile: u(y) = umax * (1 - (y/R)^2)
 * - Cells: RBC, WBC, Platelet particles
 * - Wall: reflect + damp
 * - Collisions: light repulsion (not physically accurate; for visual separation)
 * - Margination: platelets/WBC drift outward (cartoon)
 * - Optional pulsatile modulation (BPM)
 * - Optional spatial hash for faster collisions at high counts
 */

let cells = [];
let paused = false;

// Vessel geometry
let vessel;
const PAD = 80;

// UI elements
let elPause,
  elReset,
  elSpeed,
  elPulsatile,
  elBpm,
  elRBC,
  elWBC,
  elPLT,
  elApplyCounts,
  elCollide,
  elMargin,
  elBrown,
  elSpatialHash,
  elNEU, elLYM, elMONO, elCTC;

  const TUMOR_CRASH_LIMIT = 150;
let simLostMessageTimer = 0;


// Cell types (visual + approximate relative sizes)
const CELL_TYPES = {
  RBC: {
    name: "RBC",
    r: 5.0,
    color: [231, 76, 60],
    mass: 1.0,
    marginBias: 0.12,
  },

  PLT: {
    name: "PLT",
    r: 3.2,
    color: [241, 196, 15],
    mass: 0.55,
    marginBias: 0.55,
  },

  NEU: {
    name: "Neutrophil",
    r: 8.5,
    color: [210, 210, 255],
    mass: 2.5,
    marginBias: 0.35,
    adhesion: 0.35,
  },

  LYM: {
    name: "Lymphocyte",
    r: 7.0,
    color: [180, 200, 255],
    mass: 1.8,
    marginBias: 0.15,
    adhesion: 0.05,
  },

  MONO: {
    name: "Monocyte",
    r: 9.5,
    color: [160, 180, 220],
    mass: 3.0,
    marginBias: 0.45,
    adhesion: 0.45,
  },

  CTC: {
    name: "Tumor Cell",
    r: 7.8,
    color: [180, 80, 200],
    mass: 2.6,
    marginBias: 0.30,
    mlDriven: true,
  },
};


function setup() {
  createCanvas(1280, 720);
  pixelDensity(1);

  vessel = {
    x0: PAD,
    x1: width - PAD,
    y0: height * 0.5,
    R: min(height * 0.32, 220),
  };

  wireUI();
  seedPopulation(getCountsFromUI());
}

function draw() {
  background(11, 15, 20);
  drawVessel();

  if (!paused) stepSimulation();

  for (const c of cells) 
    c.draw();


  drawHUD();



}

function wireUI() {
  elPause = select("#pauseBtn");
  elReset = select("#resetBtn");
  elSpeed = select("#speed");
  elPulsatile = select("#pulsatile");
  elBpm = select("#bpm");
  elRBC = select("#rbcCount");
  elWBC = select("#wbcCount");
  elPLT = select("#pltCount");
  elNEU  = select("#neuCount");
elLYM  = select("#lymCount");
elMONO = select("#monoCount");
elCTC  = select("#ctcCount");
  elApplyCounts = select("#applyCountsBtn");
  elCollide = select("#collide");
  elMargin = select("#margination");
  elBrown = select("#brownian");
  elSpatialHash = select("#spatialHash");

  elPause.mousePressed(() => {
    paused = !paused;
    elPause.html(paused ? "Resume" : "Pause");
  });

  const reseed = () => {
    cells = [];
    seedPopulation(getCountsFromUI());
  };

  elReset.mousePressed(reseed);
  elApplyCounts.mousePressed(reseed);
}

function getCountsFromUI() {
  return {
    rbc:  int(elRBC.value()),
    plt:  int(elPLT.value()),

    neu:  int(elNEU.value()),
    lym:  int(elLYM.value()),
    mono: int(elMONO.value()),
    ctc:  int(elCTC.value()),
  };
}


function seedPopulation({ rbc, plt, neu, lym, mono, ctc }) {
  for (let i = 0; i < rbc; i++)  cells.push(new Cell("RBC"));
  for (let i = 0; i < plt; i++)  cells.push(new Cell("PLT"));
  for (let i = 0; i < neu; i++)  cells.push(new Cell("NEU"));
  for (let i = 0; i < lym; i++)  cells.push(new Cell("LYM"));
  for (let i = 0; i < mono; i++) cells.push(new Cell("MONO"));
  for (let i = 0; i < ctc; i++)  cells.push(new Cell("CTC"));

  for (const c of cells) {
    c.pos = randomPointInVessel(c.r);
    c.vel = createVector(random(0.6, 2.0), random(-0.4, 0.4));
  }
}



function randomPointInVessel(r) {
  const y = vessel.y0 + random(-vessel.R + r, vessel.R - r);
  const x = random(vessel.x0, vessel.x1);
  return createVector(x, y);
}

function stepSimulation() {
  const speed = parseFloat(elSpeed.value());
  const pulsatile = elPulsatile.elt.checked;
  const bpm = max(20, min(220, parseFloat(elBpm.value() || "72")));

  

  const collideStrength = parseFloat(elCollide.value()); // repulsion
  const marginStrength = parseFloat(elMargin.value()); // outward drift
  const brownStrength = parseFloat(elBrown.value()); // random wiggle
  const useHash = elSpatialHash.elt.checked;

  // Convert BPM to phase increment using deltaTime (ms)
  // cycles/sec = bpm/60
  const w = (bpm / 60) * TWO_PI;

  // 1) Forces: flow advection + drag + margination + jitter
  for (const c of cells) {
    const dy = c.pos.y - vessel.y0;
    const rNorm = constrain(dy / vessel.R, -1, 1);

    let umax = 3.2 * speed;

    if (pulsatile) {
      // Use millis() for stable pulsation independent of FPS
      const t = millis() / 1000;
      const pulse = 0.55 + 0.45 * sin(w * t);
      umax *= pulse;
    }

    const u = umax * (1 - rNorm * rNorm);
    const flowVel = createVector(u, 0);

    // Drag toward flow velocity (overdamped-ish)
    const drag = p5.Vector.sub(flowVel, c.vel).mult(0.08);

    // Mild margination: drift outward (toward walls)
    const outward = createVector(0, dy === 0 ? 0 : Math.sign(dy));
    const margin = outward.mult(marginStrength * c.marginBias * 0.08);

    // Brownian-ish jitter (scaled by inverse mass)
    const jitter = p5.Vector.random2D().mult((brownStrength * 0.04) / max(0.4, c.mass));

    c.acc.set(0, 0);
    c.applyForce(drag);
    c.applyForce(margin);
    c.applyForce(jitter);


      if (c.type === "CTC") {
  const shear = abs((c.vel.x - flowVel.x) * 0.5);
  const wallDist = abs((c.pos.y - vessel.y0) / vessel.R);
  const density = localCellDensity(c.pos, 35);

  const mlForce = tumorPolicy([shear, wallDist, density]).mult(0.12);
  c.applyForce(mlForce);
  if (c.type === "CTC" && c.alive) {
  // Reward clustering with other tumor cells
  const nearbyCTCs = countNearbyType(c.pos, "CTC", 30);
  c.fitness += nearbyCTCs * 0.0004;

  // Reward wall proximity (extravasation likelihood)
  const wallDist = abs((c.pos.y - vessel.y0) / vessel.R);
  if (wallDist > 0.75) c.fitness += 0.0006;

  // Penalize high shear
  if (shear > 1.2) c.fitness -= 0.003;
}

if (c.type === "CTC" && c.fitness > 1.0 && c.reproCooldown === 0) {
  c.fitness = 0;
    c.reproCooldown = 200; // ~10 seconds at 60fps


  const child = new Cell("CTC");
  child.pos = c.pos.copy().add(p5.Vector.random2D().mult(5));
  child.vel = c.vel.copy().mult(0.8);
   child.reproCooldown = 200;
  cells.push(child);
}


}

for (let i = 0; i < cells.length; i++) {
  const a = cells[i];

  if (a.type !== "NEU" && a.type !== "MONO") continue;

  for (let j = 0; j < cells.length; j++) {
    const b = cells[j];

    if (b.type !== "CTC" || !b.alive) continue;

    const d = dist(a.pos.x, a.pos.y, b.pos.x, b.pos.y);

    if (d < a.r + b.r + 2) {
      // immune attack
      b.fitness -= 0.02;
    }
  }

cells = cells.filter(c => c.alive);
if (c.reproCooldown > 0) {
  c.reproCooldown--;
}

// --- CRASH PREVENTION ---
checkTumorOverflow();

}






if (c.type === "CTC" && c.fitness < -0.5) {
  c.alive = false;
}



  }




  // 2) Collisions / repulsion
  if (collideStrength > 0.001) {
    if (useHash) collideWithSpatialHash(collideStrength);
    else collideN2(collideStrength);
  }

  // 3) Integrate, handle walls, wrap x
  for (const c of cells) {
    c.integrate();
    handleWallCollision(c);
    wrapAlongX(c);
  }
}

function collideN2(collideStrength) {
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      repelPair(cells[i], cells[j], collideStrength);
    }
  }
}

function collideWithSpatialHash(collideStrength) {
  // Cell size for hashing: tune for performance/accuracy
  const cellSize = 18; // ~ 2x max radius + margin
  const grid = new Map();

  const keyOf = (gx, gy) => `${gx},${gy}`;

  // Insert into grid
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const gx = floor(c.pos.x / cellSize);
    const gy = floor(c.pos.y / cellSize);
    const k = keyOf(gx, gy);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }

  // For each cell, only check neighbors in adjacent bins
  const neighborOffsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    const gx = floor(a.pos.x / cellSize);
    const gy = floor(a.pos.y / cellSize);

    for (const [dx, dy] of neighborOffsets) {
      const k = keyOf(gx + dx, gy + dy);
      const bucket = grid.get(k);
      if (!bucket) continue;

      for (const j of bucket) {
        if (j <= i) continue;
        repelPair(a, cells[j], collideStrength);
      }
    }
  }
}

function repelPair(a, b, collideStrength) {
  const d = dist(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
  const minD = a.r + b.r;

  if (d > 0 && d < minD) {
    const overlap = (minD - d) / minD;
    const dir = p5.Vector.sub(a.pos, b.pos).normalize();

    const push = dir.mult(overlap * collideStrength * 0.9);

    // position correction (heavier moves less)
    a.pos.add(push.copy().mult(1 / a.mass));
    b.pos.sub(push.copy().mult(1 / b.mass));

    // mild velocity deflection
    a.vel.add(push.copy().mult(0.2 / a.mass));
    b.vel.sub(push.copy().mult(0.2 / b.mass));
  }
}

function handleWallCollision(c) {
  const dy = c.pos.y - vessel.y0;
  const limit = vessel.R - c.r;

  if (dy > limit) {
    c.pos.y = vessel.y0 + limit;
    c.vel.y *= -0.65;
  } else if (dy < -limit) {
    c.pos.y = vessel.y0 - limit;
    c.vel.y *= -0.65;
  }
}

function wrapAlongX(c) {
  if (c.pos.x > vessel.x1 + c.r) {
    c.pos.x = vessel.x0 - c.r;
    c.pos.y = vessel.y0 + random(-vessel.R + c.r, vessel.R - c.r);
  }
  if (c.pos.x < vessel.x0 - c.r) {
    c.pos.x = vessel.x1 + c.r;
    c.pos.y = vessel.y0 + random(-vessel.R + c.r, vessel.R - c.r);
  }
}

function drawVessel() {
  push();

  const top = vessel.y0 - vessel.R;
  const bot = vessel.y0 + vessel.R;

  // Lumen shading
  noStroke();
  fill(20, 28, 38, 160);
  rectMode(CORNERS);
  rect(vessel.x0, top, vessel.x1, bot, 18);

  // Walls
  noFill();
  stroke(120, 160);
  strokeWeight(2);
  line(vessel.x0, top, vessel.x1, top);
  line(vessel.x0, bot, vessel.x1, bot);

  // Centerline
  stroke(255, 30);
  strokeWeight(1);
  line(vessel.x0, vessel.y0, vessel.x1, vessel.y0);

  pop();

}

function drawHUD() {
  push();
  fill(232, 240, 247, 200);
  noStroke();
  textSize(12);
  textAlign(LEFT, BOTTOM);

  const c = countTypes();
text(
  `Cells: ${cells.length} | RBC ${c.RBC}  PLT ${c.PLT}  NEU ${c.NEU}  LYM ${c.LYM}  MONO ${c.MONO}  CTC ${c.CTC}`,
  14,
  height - 10
);

  pop();

  if (simLostMessageTimer > 0) {
  simLostMessageTimer--;

  push();
  textAlign(CENTER, CENTER);
  textSize(20);
  fill(255, 80, 80, 220);
  text(
    "⚠ Simulation lost: tumor growth exceeded safe limits.\nSimulation reset.",
    width / 2,
    height * 0.85
  );
  pop();
}

}

function countTypes() {
  const counts = { RBC:0, PLT:0, NEU:0, LYM:0, MONO:0, CTC:0 };
  for (const c of cells) counts[c.type]++;
  return counts;
}


// Mouse drag: inject a disturbance (swirl)
function mouseDragged() {
  const center = createVector(mouseX, mouseY);
  for (const c of cells) {
    const d = p5.Vector.dist(c.pos, center);
    if (d < 120) {
      const tang = p5.Vector.sub(c.pos, center);
      const swirl = createVector(-tang.y, tang.x).normalize();
      swirl.mult((120 - d) * 0.002);
      c.vel.add(swirl);
    }
  }
}

class Cell {
  constructor(typeKey) {
    const spec = CELL_TYPES[typeKey];
    this.type = typeKey;
    this.r = spec.r;
    this.mass = spec.mass;
    this.marginBias = spec.marginBias;
    this.col = spec.color.slice();
    this.pos = createVector(0, 0);
    this.vel = createVector(0, 0);
    this.acc = createVector(0, 0);
    this.fitness = 0;
    this.alive = true;
    this.reproCooldown = 0;

  }

  applyForce(f) {
    this.acc.add(p5.Vector.div(f, this.mass));
  }

  integrate() {
    this.vel.add(this.acc);
    this.vel.mult(0.995);
    this.vel.limit(8);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }

  draw() {
  if (!this.alive) {
  fill(120, 120, 120, 80);
  circle(this.pos.x, this.pos.y, this.r * 2);
  return;
}

    push();
    noStroke();

    if (this.type === "RBC") {
      // Ellipse with a little "biconcave" hint
      fill(this.col[0], this.col[1], this.col[2], 210);
      const a = atan2(this.vel.y, this.vel.x);
      translate(this.pos.x, this.pos.y);
      rotate(a);
      ellipse(0, 0, this.r * 2.2, this.r * 1.6);
      fill(0, 0, 0, 25);
      ellipse(0, 0, this.r * 1.2, this.r * 0.9);
    } else if (this.type === "WBC") {
      fill(this.col[0], this.col[1], this.col[2], 220);
      circle(this.pos.x, this.pos.y, this.r * 2);
      fill(120, 120, 180, 35);
      circle(this.pos.x + this.r * 0.2, this.pos.y - this.r * 0.1, this.r * 1.0);
    } else {
      fill(this.col[0], this.col[1], this.col[2], 220);
      circle(this.pos.x, this.pos.y, this.r * 2);
    }

    pop();
  }
}

function tumorPolicy(inputs) {
  // inputs = [shear, wallDist, density]
  // 2-layer tiny NN (pretrained weights)
  const W1 = [
    [0.8, -0.6, 0.3],
    [-0.4, 0.9, 0.2],
  ];
  const B1 = [0.1, -0.1];

  const W2 = [
    [0.6, -0.7],
    [0.3, 0.4],
  ];

  // hidden
  const h = [
    Math.tanh(
      W1[0][0] * inputs[0] +
      W1[0][1] * inputs[1] +
      W1[0][2] * inputs[2] +
      B1[0]
    ),
    Math.tanh(
      W1[1][0] * inputs[0] +
      W1[1][1] * inputs[1] +
      W1[1][2] * inputs[2] +
      B1[1]
    ),
  ];

  return createVector(
    W2[0][0] * h[0] + W2[0][1] * h[1],
    W2[1][0] * h[0] + W2[1][1] * h[1]
  );
}


function localCellDensity(pos, radius) {
  let count = 0;
  for (const c of cells) {
    if (p5.Vector.dist(pos, c.pos) < radius) count++;
  }
  return count / 10.0;
}


function countNearbyType(pos, type, r) {
  let n = 0;
  for (const c of cells) {
    if (c.type === type && p5.Vector.dist(pos, c.pos) < r) n++;
  }
  return n;
}

function checkTumorOverflow() {
  const tumorCount = cells.filter(c => c.type === "CTC").length;

  if (tumorCount >= TUMOR_CRASH_LIMIT) {
    // Flag loss
    simLostMessageTimer = 240; // show warning ~4 seconds

    // Reset simulation safely
    cells = [];
    seedPopulation(getCountsFromUI());

    return true;
  }
  return false;
}

