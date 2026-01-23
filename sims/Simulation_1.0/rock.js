class Rock {
  constructor(x, y, r = 40) {
    this.position = createVector(x, y);
    this.r = r;
  }

  show() {
    noStroke();
    fill(120); // gray
    circle(this.position.x, this.position.y, this.r * 2);
  }
}
