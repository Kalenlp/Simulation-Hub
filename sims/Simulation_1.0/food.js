class Food {
  constructor() {
    this.position = createVector(random(width), random(height));
    this.r = 50;
  }

  show() {
    noStroke();
    fill(0, 255, 0, 150);
    circle(this.position.x, this.position.y, this.r * 2);
  }
}