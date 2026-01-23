let bloops = [];
let timeSlider;
let food = [];
let water = [];
let rocks = [];


function setup() {
  createCanvas(1500, 800);
  ml5.tf.setBackend("cpu");

//   initialize the creatures
  for (let i = 0; i < 14; i++) {
    bloops[i] = new Creature(random(width), random(height));
  }

// initialize the food
  for (let i = 0; i < 10; i++) {
    food[i] = new Food();
  }

// initialize the water
for (let i = 0; i < 8; i++) {
    water[i] = new Water();
  }

for (let i = 0; i < 10; i++) {
  rocks.push(
    new Rock(
      random(width),
      random(height),
      random(30, 60)
    )
  );
}


  timeSlider = createSlider(1, 20, 1);
  timeSlider.position(10, 220);
}

function draw() {
  background(255);
  for (let i = 0; i < timeSlider.value(); i++) {
    for (let i = bloops.length - 1; i >= 0; i--) {
      bloops[i].think();
      bloops[i].eat();
      bloops[i].drink();
      bloops[i].update();
      bloops[i].handleRocks(rocks);
      bloops[i].borders();
      
      if (bloops[i].health < 0) {
        bloops.splice(i, 1);
      } else if (bloops[i].health > 70 && random(1) < 0.0015) {
        let child = bloops[i].reproduce();
        bloops.push(child);
      }
    }
  }

  for (let treat of food) {
    treat.show();
  }

  for (let bloop of bloops) {
    bloop.show();
  }

  let oldest = getOldestBloop();
if (oldest) {
  drawHighlight(oldest);
  drawChampionStats(oldest, width - 260, 20);
}


  for (let watersource of water) {
    watersource.show();
  }

  for (let rock of rocks) {
  rock.show();
}


  drawLegend(20, 20);


}


function countBloopStates() {
    let hungerThreshold = 30;
    let thirstThreshold = 30;
  let hungry = 0;
  let thirsty = 0;
  let healthy = 0;
  let both= 0;

  for (let b of bloops) {
    if (b.foodlvl < hungerThreshold && b.waterlvl < thirstThreshold) {
      both++;
    }else if (b.foodlvl < hungerThreshold) {
      hungry++;
    } else if (b.waterlvl < thirstThreshold) {
      thirsty++;
    } else {
      healthy++;
    }
  }

  return { both, hungry, thirsty, healthy };
}

function drawLegend(x, y) {
  let stats = countBloopStates();
  let total = bloops.length || 1;

  let barWidth = 200;
  let barHeight = 20;

  let hungryRatio = stats.hungry / total;
  let thirstyRatio = stats.thirsty / total;
  let healthyRatio = stats.healthy / total;
  let bothRatio = stats.both / total;

  noStroke();

  // Healthy (green)
  fill(0, 200, 0);
  rect(x, y, barWidth * healthyRatio, barHeight);

  // Thirsty (yellow)
  fill(220, 220, 0);
  rect(
    x + barWidth * healthyRatio,
    y,
    barWidth * thirstyRatio,
    barHeight
  );

  // Hungry (red)
  fill(220, 0, 0);
  rect(
    x + barWidth * (healthyRatio + thirstyRatio),
    y,
    barWidth * hungryRatio,
    barHeight
  );

    // Both (purple)
  fill(191, 0, 255);
  rect(
    x + barWidth * (healthyRatio + thirstyRatio+hungryRatio),
    y,
    barWidth * bothRatio,
    barHeight
  );

  // Labels
  fill(0);
  textSize(12);
  textAlign(LEFT, TOP);

  text(`Healthy: ${stats.healthy}`, x, y + barHeight + 5);
  text(`Thirsty: ${stats.thirsty}`, x, y + barHeight + 20);
  text(`Hungry: ${stats.hungry}`, x, y + barHeight + 35);
  text(`Both: ${stats.both}`, x, y + barHeight + 50);
  text(`Total: ${total}`, x, y + barHeight + 65);
}

function getOldestBloop() {
  let oldest = null;
  let maxAge = -1;

  for (let b of bloops) {
    if (b.age > maxAge) {
      maxAge = b.age;
      oldest = b;
    }
  }

  return oldest;
}

function drawHighlight(bloop) {
  push();
  translate(bloop.position.x, bloop.position.y);

  noFill();
  stroke(255, 215, 0); // gold
  strokeWeight(2);

  let r = bloop.r * 2.5;
  circle(0, 0, r * 2);

  pop();
}


function drawChampionStats(bloop, x, y) {
  if (!bloop) return;

  push();
  noStroke();
  fill(255, 250);
  rect(x - 10, y - 10, 270, 150, 8);

  fill(0);
  textSize(12);
  textAlign(LEFT, TOP);

  let line = 0;
  let lh = 16;

  text("🏆 Champion Bloop", x, y + line * lh); line++;
  text(`Age: ${bloop.age}`, x, y + line * lh); line++;
  text(`Health: ${bloop.health.toFixed(1)}`, x, y + line * lh); line++;
  text(`Food: ${bloop.foodlvl.toFixed(1)}`, x, y + line * lh); line++;
  text(`Water: ${bloop.waterlvl.toFixed(1)}`, x, y + line * lh); line++;

  // Optional: brain info (safe, non-invasive)
  text(`Brain outputs: ${bloop.brain.options.outputs}`, x, y + line * lh); line++;

  pop();
}


