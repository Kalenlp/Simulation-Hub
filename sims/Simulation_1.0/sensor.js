class Sensor {
  constructor(v) {
    this.v = v.copy();
    this.value = 0;
  }

  sense(position, targets) {
  let end = p5.Vector.add(position, this.v);
  let maxValue = 0;

  for (let t of targets) {
    let d = end.dist(t.position);
    if (d < t.r) {
      maxValue = max(maxValue, 1 - d / t.r);
    }
  }

  this.value = maxValue;
  return maxValue;
}

}
