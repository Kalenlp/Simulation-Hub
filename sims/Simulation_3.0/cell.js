/* Living Animal Cell — Zoomable organelle simulation (vanilla JS + SVG)
   - Click organelle -> smooth viewBox zoom + focus state
   - Focus activates micro-sim particles around that organelle
*/

const svg = document.getElementById("cellSvg");
const particlesLayer = document.getElementById("particles");
const cytoField = document.getElementById("cytoField");

const panelTitle = document.getElementById("panelTitle");
const panelBody = document.getElementById("panelBody");
const panelStats = document.getElementById("panelStats");

const btnHome = document.getElementById("btnHome");
const btnBack = document.getElementById("btnBack");
const btnToggle = document.getElementById("btnToggle");
const speedSlider = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");

// -------------------- Organelles definition --------------------
const organelleInfo = {
  nucleus: {
    name: "Nucleus",
    desc: "Central control center. While focused, you’ll see mRNA-like particles leaving the nucleus region.",
    stats: () => [
      ["Transcription", `${(simCounters.mrnaPerSec).toFixed(2)}/s`],
      ["mRNA in motion", `${liveParticles.filter(p => p.type === "mrna").length}`],
    ],
    // Zoom target (in SVG coords)
    focus: { cx: 445, cy: 320, w: 360, h: 260 },
    micro: { type: "mrna", rate: 4.0, radius: 120 }
  },
  mito1: {
    name: "Mitochondrion",
    desc: "Energy hub. Focus shows ATP-like particles pulsing outward from cristae.",
    stats: () => [
      ["ATP production", `${(simCounters.atpPerSec).toFixed(2)}/s`],
      ["ATP in motion", `${liveParticles.filter(p => p.type === "atp").length}`],
    ],
    focus: { cx: 675, cy: 405, w: 360, h: 260 },
    micro: { type: "atp", rate: 6.0, radius: 105 }
  },
  mito1_cristae: {
  name: "Cristae (Electron Transport Chain)",
  desc: "Inner mitochondrial membrane folds. This is where the electron transport chain generates the proton gradient that drives ATP synthesis.",
  stats: () => [
    ["ETC flux", `${(simCounters.atpPerSec * 2).toFixed(2)}/s`],
    ["ATP particles", `${liveParticles.filter(p => p.type === "atp").length}`],
  ],
  focus: {
    cx: 700,   // tweak these numbers visually
    cy: 395,
    w: 160,
    h: 110
  },
  micro: {
    type: "atp",
    rate: 12.0,
    radius: 35
  }
},

  mito2: {
    name: "Mitochondrion",
    desc: "Another mitochondrion. Same process, separate local activity field.",
    stats: () => [
      ["ATP production", `${(simCounters.atpPerSec).toFixed(2)}/s`],
      ["ATP in motion", `${liveParticles.filter(p => p.type === "atp").length}`],
    ],
    focus: { cx: 290, cy: 450, w: 380, h: 280 },
    micro: { type: "atp", rate: 5.0, radius: 105 }
  },
  golgi: {
    name: "Golgi Apparatus",
    desc: "Packaging + shipping center. Focus shows vesicles budding and drifting away.",
    stats: () => [
      ["Vesicles", `${(simCounters.vesPerSec).toFixed(2)}/s`],
      ["Vesicles in motion", `${liveParticles.filter(p => p.type === "ves").length}`],
    ],
    focus: { cx: 585, cy: 235, w: 430, h: 300 },
    micro: { type: "ves", rate: 3.5, radius: 120 }
  },
  rer: {
    name: "Rough ER",
    desc: "Protein assembly line. Focus shows protein packets drifting toward Golgi direction.",
    stats: () => [
      ["Protein packets", `${(simCounters.protPerSec).toFixed(2)}/s`],
      ["Packets in motion", `${liveParticles.filter(p => p.type === "prot").length}`],
    ],
    focus: { cx: 325, cy: 245, w: 460, h: 320 },
    micro: { type: "prot", rate: 4.0, radius: 135 }
  },
  lyso: {
    name: "Lysosome",
    desc: "Recycling + breakdown. Focus shows debris fragments being pulled inward.",
    stats: () => [
      ["Breakdown", `${(simCounters.debPerSec).toFixed(2)}/s`],
      ["Debris in motion", `${liveParticles.filter(p => p.type === "deb").length}`],
    ],
    focus: { cx: 720, cy: 290, w: 360, h: 260 },
    micro: { type: "deb", rate: 3.0, radius: 95 }
  }
};

// -------------------- ViewBox camera --------------------
const baseView = { x: 0, y: 0, w: 1000, h: 650 };
let camera = { ...baseView };
let targetCam = { ...baseView };
let camStack = []; // history for Back

function setViewBox(cam){
  svg.setAttribute("viewBox", `${cam.x.toFixed(3)} ${cam.y.toFixed(3)} ${cam.w.toFixed(3)} ${cam.h.toFixed(3)}`);
}

function ease(a, b, t){
  return a + (b - a) * t;
}

function animateCamera(dt){
  // smooth approach to target
  const k = 1 - Math.pow(0.001, dt); // stable across framerate
  camera.x = ease(camera.x, targetCam.x, k);
  camera.y = ease(camera.y, targetCam.y, k);
  camera.w = ease(camera.w, targetCam.w, k);
  camera.h = ease(camera.h, targetCam.h, k);
  setViewBox(camera);
}

// -------------------- Focus logic --------------------
let focusedId = null;

function setFocused(id){
  focusedId = id;

  document.querySelectorAll(".organelle").forEach(el => {
    const organelleId = el.getAttribute("data-organelle");

    const isDirect =
      organelleId === id ||
      (id && id.startsWith(organelleId)); // mito1_cristae → mito1

    el.classList.toggle("focused", isDirect);
    el.style.opacity = (!id || isDirect) ? "1" : "0.25";
  });

  if(!id){
    panelTitle.textContent = "Whole Cell";
    panelBody.textContent =
      "Click an organelle to zoom. You’ll see live activity appear when you focus.";
    panelStats.innerHTML = "";
    return;
  }

  const info = organelleInfo[id];
  panelTitle.textContent = info?.name ?? id;
  panelBody.textContent = info?.desc ?? "";
  renderStats();
}


function renderStats(){
  if(!focusedId){ panelStats.innerHTML = ""; return; }
  const info = organelleInfo[focusedId];
  if(!info?.stats){ panelStats.innerHTML = ""; return; }

  const rows = info.stats();
  panelStats.innerHTML = rows.map(([k,v]) => `
    <div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>
  `).join("");
}

// -------------------- Micro-sim particles --------------------
let liveParticles = [];
const simCounters = {
  atpPerSec: 0,
  mrnaPerSec: 0,
  vesPerSec: 0,
  protPerSec: 0,
  debPerSec: 0,
};

function rand(a,b){ return a + Math.random()*(b-a); }

function createSvgCircle(r){
  const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
  c.setAttribute("r", r);
  c.setAttribute("class","p");
  particlesLayer.appendChild(c);
  return c;
}

function particleStyle(type){
  // avoid explicit colors if you want—this keeps a soft single palette:
  // We’ll use opacity + radius differences for distinction.
  switch(type){
    case "atp": return { r: 3.5, op: 0.95 };
    case "mrna": return { r: 3.0, op: 0.85 };
    case "ves": return { r: 4.5, op: 0.85 };
    case "prot": return { r: 3.8, op: 0.88 };
    case "deb": return { r: 2.6, op: 0.75 };
    default: return { r: 3.2, op: 0.8 };
  }
}

function spawnParticleForFocused(dt, speed){
  if(!focusedId) return;

  const info = organelleInfo[focusedId];
  const micro = info?.micro;
  if(!micro) return;

  const rate = micro.rate * speed;
  const expected = rate * dt;
  const count = Math.floor(expected) + (Math.random() < (expected % 1) ? 1 : 0);
  if(count <= 0) return;

  const f = info.focus;
  const cx = f.cx, cy = f.cy;
  const rad = micro.radius;

  for(let i=0;i<count;i++){
    const a = rand(0, Math.PI*2);
    const r = rad * Math.sqrt(Math.random());
    const x = cx + Math.cos(a)*r;
    const y = cy + Math.sin(a)*r;

    const style = particleStyle(micro.type);
    const el = createSvgCircle(style.r);
    el.setAttribute("opacity", style.op);

    // Behavior rules (tiny “life-feel”):
    // - ATP: drift outward
    // - mRNA: drift outward + slightly toward RER direction (left-ish)
    // - ves: drift outward + a little down/right
    // - prot: drift toward Golgi direction (right-ish)
    // - deb: pull inward (toward lysosome center)
    let vx = 0, vy = 0;
    if(micro.type === "atp"){
      vx = (x - cx) * 0.45;
      vy = (y - cy) * 0.45;
    } else if(micro.type === "mrna"){
      vx = (x - cx) * 0.25 - 18;
      vy = (y - cy) * 0.25 + rand(-8,8);
    } else if(micro.type === "ves"){
      vx = (x - cx) * 0.18 + 14;
      vy = (y - cy) * 0.18 + 10;
    } else if(micro.type === "prot"){
      vx = 22 + rand(-6,6);
      vy = 10 + rand(-8,8);
    } else if(micro.type === "deb"){
      vx = (cx - x) * 0.35;
      vy = (cy - y) * 0.35;
    }

    // normalize-ish and scale
    const mag = Math.hypot(vx,vy) || 1;
    vx = (vx/mag) * rand(18, 46);
    vy = (vy/mag) * rand(18, 46);

    liveParticles.push({
      type: micro.type,
      x, y,
      vx, vy,
      life: rand(0.8, 1.8),
      age: 0,
      el
    });
  }
}

function updateParticles(dt, speed){
  const bounds = { x: -80, y: -80, w: 1160, h: 810 };
  for(let i=liveParticles.length-1; i>=0; i--){
    const p = liveParticles[i];
    p.age += dt * speed;

    // a little “Brownian wiggle”
    p.vx += rand(-6,6) * dt;
    p.vy += rand(-6,6) * dt;

    p.x += p.vx * dt * speed;
    p.y += p.vy * dt * speed;

    // fade out near end
    const t = p.age / p.life;
    const fade = (t < 0.8) ? 1 : Math.max(0, 1 - (t - 0.8) / 0.2);
    p.el.setAttribute("cx", p.x.toFixed(2));
    p.el.setAttribute("cy", p.y.toFixed(2));
    p.el.setAttribute("opacity", (0.92 * fade).toFixed(2));

    const out =
      p.x < bounds.x || p.y < bounds.y ||
      p.x > bounds.x + bounds.w || p.y > bounds.y + bounds.h;

    if(t >= 1 || out){
      p.el.remove();
      liveParticles.splice(i,1);
    }
  }
}

// Simple counters derived from spawn rates (feels “live” in panel)
function updateCounters(speed){
  // Base rates are only “active” when relevant organelle is focused
  simCounters.atpPerSec = (focusedId && organelleInfo[focusedId]?.micro?.type === "atp") ? organelleInfo[focusedId].micro.rate * speed : 0;
  simCounters.mrnaPerSec = (focusedId && organelleInfo[focusedId]?.micro?.type === "mrna") ? organelleInfo[focusedId].micro.rate * speed : 0;
  simCounters.vesPerSec = (focusedId && organelleInfo[focusedId]?.micro?.type === "ves") ? organelleInfo[focusedId].micro.rate * speed : 0;
  simCounters.protPerSec = (focusedId && organelleInfo[focusedId]?.micro?.type === "prot") ? organelleInfo[focusedId].micro.rate * speed : 0;
  simCounters.debPerSec = (focusedId && organelleInfo[focusedId]?.micro?.type === "deb") ? organelleInfo[focusedId].micro.rate * speed : 0;
}

// -------------------- Cytoplasm drift field --------------------
const cytoDots = [];
function initCytoplasm(){
  // light dots in cytoplasm for “alive” feel
  const n = 160;
  for(let i=0;i<n;i++){
    const c = document.createElementNS("http://www.w3.org/2000/svg","circle");
    c.setAttribute("class","cytodot");
    const r = rand(1.2, 3.0);
    c.setAttribute("r", r);
    const x = rand(170, 840);
    const y = rand(120, 560);
    c.setAttribute("cx", x);
    c.setAttribute("cy", y);
    c.setAttribute("opacity", rand(0.05, 0.18));
    cytoField.appendChild(c);
    cytoDots.push({ el:c, x, y, r, vx: rand(-10,10), vy: rand(-8,8) });
  }
}

function updateCytoplasm(dt, speed){
  const s = 0.22 * speed;
  for(const d of cytoDots){
    // gentle flow + noise
    d.vx += rand(-2,2) * dt;
    d.vy += rand(-2,2) * dt;

    d.x += d.vx * dt * s;
    d.y += d.vy * dt * s;

    // wrap in a soft box
    if(d.x < 140) d.x = 860;
    if(d.x > 860) d.x = 140;
    if(d.y < 90) d.y = 580;
    if(d.y > 580) d.y = 90;

    d.el.setAttribute("cx", d.x.toFixed(1));
    d.el.setAttribute("cy", d.y.toFixed(1));
  }
}

// -------------------- Interaction --------------------



function focusOrganelle(id) {
  if (!organelleInfo[id]) return;
  setFocused(id);
}


function zoomToOrganelle(id){
  const info = organelleInfo[id];
  if(!info) return;

  camStack.push({ ...targetCam });

  const f = info.focus;
  targetCam = {
    x: f.cx - f.w / 2,
    y: f.cy - f.h / 2,
    w: f.w,
    h: f.h
  };

  focusOrganelle(id);
}




function goHome(){
  camStack = [];
  targetCam = { ...baseView };
  setFocused(null);

  // clear focused particles a bit faster by shortening life
  // (or just let them fade naturally)
}

function goBack(){
  if(camStack.length === 0){
    goHome();
    return;
  }
  targetCam = camStack.pop();
  // If we popped back to base-ish, defocus
  const nearBase =
    Math.abs(targetCam.x - baseView.x) < 1 &&
    Math.abs(targetCam.y - baseView.y) < 1 &&
    Math.abs(targetCam.w - baseView.w) < 1 &&
    Math.abs(targetCam.h - baseView.h) < 1;

  if(nearBase) setFocused(null);
  // Otherwise, try to infer focus by closest organelle
  else setFocused(findClosestOrganelle(targetCam));
}

function findClosestOrganelle(cam){
  const cx = cam.x + cam.w / 2;
  const cy = cam.y + cam.h / 2;

  let best = null;
  let bestD = Infinity;

  for(const [id, info] of Object.entries(organelleInfo)){
    const dx = info.focus.cx - cx;
    const dy = info.focus.cy - cy;
    const d = dx * dx + dy * dy;

    if(d < bestD){
      bestD = d;
      best = id;
    }
  }

  return best;
}


// Bind clicks on organelles
document.querySelectorAll(".organelle").forEach(el => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = el.getAttribute("data-organelle");

    if (e.shiftKey) {
      focusOrganelle(id);   // focus only
    } else {
      zoomToOrganelle(id);  // zoom + focus
    }
  });
});

// Bind clicks on second-level focus targets (e.g. cristae)
document.querySelectorAll(".focus-target").forEach(el => {
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = el.getAttribute("data-focus");
    zoomToOrganelle(id);
  });
});



// Buttons
btnHome.addEventListener("click", goHome);
btnBack.addEventListener("click", goBack);

let paused = false;
btnToggle.addEventListener("click", () => {
  paused = !paused;
  btnToggle.textContent = paused ? "Play" : "Pause";
});

speedSlider.addEventListener("input", () => {
  speedVal.textContent = `${Number(speedSlider.value).toFixed(2)}×`;
});

// Optional: click empty space doesn’t reset by default (keeps “focus mode”)
svg.addEventListener("click", () => {
  // You can enable “click background to go back” by uncommenting:
  // goBack();
});

// -------------------- Main loop --------------------
let last = performance.now();

function loop(now){
  const dtRaw = (now - last) / 1000;
  last = now;

  const speed = Number(speedSlider.value);

  if(!paused){
    const dt = Math.min(0.033, Math.max(0.0, dtRaw)); // clamp
    animateCamera(dt);

    updateCytoplasm(dt, speed);
    spawnParticleForFocused(dt, speed);
    updateParticles(dt, speed);

    updateCounters(speed);
    renderStats();
  }

  requestAnimationFrame(loop);
}

// init
setViewBox(baseView);
initCytoplasm();
setFocused(null);
requestAnimationFrame(loop);
