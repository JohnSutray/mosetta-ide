interface Point { x: number; y: number }

function length(p: Point): number {
  const squared: number = p.x * p.x +
    p.y * p.y;
  return Math.sqrt(squared);
}
console.log(length({ x: 3, y: 4 }));
