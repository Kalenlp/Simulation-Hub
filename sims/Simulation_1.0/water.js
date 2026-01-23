class Water {
  constructor() {
    this.position = createVector(random(width), random(height));
    this.r = 60; // slightly larger than food (optional)
  }

  show() {
    noStroke();
    fill(0, 100, 255, 150); // blue water
    circle(this.position.x, this.position.y, this.r * 2);
  }
}
