interface Point { x: number; y: number }

function lengthOf(p: Point): number {
  const squared: number = p.x * p.x +
    p.y * p.y;
  return Math.sqrt(squared);
}
console.log(lengthOf({ x: 3, y: 4 }));
