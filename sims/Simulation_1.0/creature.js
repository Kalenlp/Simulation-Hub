class Creature {
  constructor(x, y, brain) {
    this.position = createVector(x, y);
    this.velocity = createVector(0, 0);
    this.acceleration = createVector(0, 0);
    this.fullSize = 12;
    this.r = this.fullSize;
    this.maxspeed = 4;
    this.sensors = [];
    this.health = 100;
    this.foodlvl=100;
    this.waterlvl=100;
    this.age = 0;


    let totalSensors = 15;
    for (let i = 0; i < totalSensors; i++) {
      let a = map(i, 0, totalSensors, 0, TWO_PI);
      let v = p5.Vector.fromAngle(a);
      v.mult(this.fullSize * 1.5);
      this.sensors[i] = new Sensor(v);
    }

    if (brain) {
      this.brain = brain;
    } else {
      this.brain = ml5.neuralNetwork({
        inputs: this.sensors.length+1,
        outputs: 3,
        task: "regression",
        neuroEvolution: true,
      });
    }
    this.brain.mutate(0.2);
  }

  reproduce() {
    let brain = this.brain.copy();
    brain.mutate(0.1);
    return new Creature(this.position.x, this.position.y, brain);
  }

  eat() {
    for (let i = 0; i < food.length; i++) {
      let d = p5.Vector.dist(this.position, food[i].position);
      if (d < this.r + food[i].r) {
        this.foodlvl += 2;
        food[i].r -= 0.05;
        if (food[i].r < 20) {
          food[i] = new Food();
        }
      }
    }
  }


  drink() {
  for (let i = 0; i < water.length; i++) {
    let d = p5.Vector.dist(this.position, water[i].position);
    if (d < this.r + water[i].r) {
      this.waterlvl+=2;
      water[i].r -= 0.15;

      if (water[i].r < 20) {
        water[i] = new Water();
      }
    }
  }
}



  think() {
    for (let i = 0; i < this.sensors.length; i++) {
      this.sensors[i].value = 0;
      // Sense food
    this.sensors[i].sense(this.position, food);

    // Sense water (do NOT overwrite blindly)
    this.sensors[i].value = max(
      this.sensors[i].value,
      this.sensors[i].sense(this.position, water));
    }
    let inputs = [];
    for (let i = 0; i < this.sensors.length; i++) {
      inputs[i] = this.sensors[i].value;
    }

    // INTERNAL DRIVE (this is the key)
    let internalDrive = noise(
    frameCount * 0.03 + this.position.x * 0.03
    );
    inputs.push(internalDrive);

    // Predicting the force to apply
    const outputs = this.brain.predictSync(inputs);
    let angle = outputs[0].value * TWO_PI;
    let magnitude = outputs[1].value;
    let moveSignal = outputs[2].value; // NEW

    // Optional: clamp magnitude
    magnitude = constrain(magnitude, 0, 1);

    // Decide whether to move
    if (moveSignal > 0.5) {
    let force = p5.Vector.fromAngle(angle).setMag(magnitude);
    this.applyForce(force);
    }

  }

  // Method to update location
  update() {
    // Update velocity
    this.velocity.add(this.acceleration);
    // Limit speed
    this.velocity.limit(this.maxspeed);
    this.position.add(this.velocity);
    // Reset acceleration to 0 each cycle
    this.acceleration.mult(0);
    this.age++;
    if (this.waterlvl<10 || this.foodlvl<10){
        this.health -= 1;
    }
    this.waterlvl-=0.2;
    this.foodlvl-=0.2;
  }

  // Wraparound
  borders() {
    if (this.position.x < -this.r) this.position.x = width + this.r;
    if (this.position.y < -this.r) this.position.y = height + this.r;
    if (this.position.x > width + this.r) this.position.x = -this.r;
    if (this.position.y > height + this.r) this.position.y = -this.r;
  }

  applyForce(force) {
    // We could add mass here if we want A = F / M
    this.acceleration.add(force);
  }

  handleRocks(rocks) {
  for (let rock of rocks) {
    let d = p5.Vector.dist(this.position, rock.position);
    let minDist = this.r + rock.r;

    if (d < minDist) {
      // Direction away from rock
      let push = p5.Vector.sub(this.position, rock.position);
      push.normalize();
      push.mult(minDist - d + 1);

      // Move creature out of rock
      this.position.add(push);

      // Reflect velocity (bounce)
      this.velocity.reflect(push.normalize());

      // Lose a little energy on impact
      this.velocity.mult(0.7);
    }
  }
}


  show() {
    push();
    translate(this.position.x, this.position.y);
    for (let sensor of this.sensors) {
      stroke(0, this.health * 2);
      line(0, 0, sensor.v.x, sensor.v.y);
      if (sensor.value > 0) {
        fill(255, sensor.value * 255);
        stroke(0, 100);
        circle(sensor.v.x, sensor.v.y, 4);
      }
    }
    noStroke();
    let bodyColor;

    // thresholds (tune these)
    let hungerThreshold = 30;
    let thirstThreshold = 30;

    if (this.foodlvl < hungerThreshold && this.waterlvl < thirstThreshold) {
    // both → purple
    bodyColor = color(191, 0, 255);
    } 
    else if (this.foodlvl < hungerThreshold) {
    // HUNGRY → red
    bodyColor = color(220, 0, 0);
    } 
    else if (this.waterlvl < thirstThreshold) {
    // THIRSTY → yellow
    bodyColor = color(220, 220, 0);
    }
    else {
    // HEALTHY → green
    bodyColor = color(0, 200, 0);
    }

    fill(bodyColor);

    this.r = map(this.health, 0, 100, 2, this.fullSize);
    this.r = constrain(this.r, 2, this.fullSize);

circle(0, 0, this.r * 2);
    pop();
  }
}





