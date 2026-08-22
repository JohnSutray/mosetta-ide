
export interface Sheep {
  x: number;
  y: number;
  vx: number;
  vy: number;
  big: number;
  shorn: boolean;
  face: number;
  step: number;
  held: boolean;
}

export interface Bale {
  x: number;
  y: number;
}

export interface World {
  flock: Sheep[];
  bales: Bale[];
  waiting: boolean;
  held: Sheep | null;
  merged: number;
  shorn: number;
  frame: number;
}

export const PX = 3;
export const SHEEP_W = 8 * PX;
export const SHEEP_H = 5 * PX;
export const HOUSE_W = 10 * PX * 2;
export const HOUSE_H = 7 * PX * 2;

const CAP = 7;
const SPEED = 0.5;
export const SPAWN_EVERY = 180;

export function createWorld(): World {
  return { flock: [], bales: [], waiting: false, held: null, merged: 0, shorn: 0, frame: 0 };
}

export function barnAt(w: number, h: number) {
  return { x: w / 2 - HOUSE_W - 24, y: h / 2 - HOUSE_H / 2 };
}

export function salonAt(w: number, h: number) {
  return { x: w / 2 + 24, y: h / 2 - HOUSE_H / 2 };
}

export function spawn(world: World, w: number, h: number, roll = Math.random, inside = false): void {
  if (world.flock.length >= CAP || w < 80 || h < 60) return;
  const fromLeft = roll() < 0.5;
  world.flock.push({
    x: inside
      ? 20 + roll() * Math.max(1, w - 80)
      : fromLeft
        ? -SHEEP_W
        : w + SHEEP_W,
    y: 20 + roll() * Math.max(1, h - 60),
    vx: (fromLeft ? 1 : -1) * SPEED,
    vy: (roll() - 0.5) * SPEED,
    big: 1,
    shorn: false,
    face: fromLeft ? 1 : -1,
    step: roll() * 10,
    held: false,
  });
}

export function step(world: World, w: number, h: number, roll = Math.random): void {
  world.frame += 1;
  if (world.frame % SPAWN_EVERY === 0) spawn(world, w, h, roll);

  for (const s of world.flock) {
    if (s.held) continue;
    if (roll() < 0.01) {
      s.vx += (roll() - 0.5) * 0.1;
      s.vy += (roll() - 0.5) * 0.1;
    }
    const speed = Math.hypot(s.vx, s.vy);
    const want = SPEED * (s.big > 1 ? 0.7 : 1);
    if (speed > 0) {
      s.vx = (s.vx / speed) * want;
      s.vy = (s.vy / speed) * want;
    } else {
      const angle = roll() * Math.PI * 2;
      s.vx = Math.cos(angle) * want;
      s.vy = Math.sin(angle) * want;
    }
    s.x += s.vx;
    s.y += s.vy;
    s.step += 0.08;
    if (Math.abs(s.vx) > 0.02) s.face = s.vx > 0 ? 1 : -1;
    if (s.x < 0 && s.vx < 0) s.vx = Math.abs(s.vx);
    if (s.x + SHEEP_W * s.big > w && s.vx > 0) s.vx = -Math.abs(s.vx);
    if (s.y < 0 && s.vy < 0) s.vy = Math.abs(s.vy);
    if (s.y + SHEEP_H * s.big > h && s.vy > 0) s.vy = -Math.abs(s.vy);
  }

  for (let i = 0; i < world.flock.length; i += 1) {
    for (let j = i + 1; j < world.flock.length; j += 1) bump(world.flock[i]!, world.flock[j]!);
  }
}

function bump(a: Sheep, b: Sheep): void {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const near = (SHEEP_W * (a.big + b.big)) / 2.6;
  const far = Math.hypot(dx, dy);
  if (far > near || far === 0) return;
  const nx = dx / far;
  const ny = dy / far;
  const speedA = Math.hypot(a.vx, a.vy) || 0.5;
  const speedB = Math.hypot(b.vx, b.vy) || 0.5;
  a.vx = nx * speedA;
  a.vy = ny * speedA;
  b.vx = -nx * speedB;
  b.vy = -ny * speedB;
  const gap = (near - far) / 2;
  a.x += nx * gap;
  a.y += ny * gap;
  b.x -= nx * gap;
  b.y -= ny * gap;
}

export function grab(world: World, x: number, y: number): boolean {
  for (let i = world.flock.length - 1; i >= 0; i -= 1) {
    const s = world.flock[i]!;
    if (x >= s.x && x <= s.x + SHEEP_W * s.big && y >= s.y && y <= s.y + SHEEP_H * s.big) {
      world.held = s;
      s.held = true;
      return true;
    }
  }
  return false;
}

export function moveHeld(world: World, x: number, y: number): void {
  const s = world.held;
  if (!s) return;
  s.x = x - (SHEEP_W * s.big) / 2;
  s.y = y - (SHEEP_H * s.big) / 2;
}

export type Drop = 'none' | 'waiting' | 'merged' | 'shorn';

export function release(world: World, w: number, h: number): Drop {
  const s = world.held;
  world.held = null;
  if (!s) return 'none';
  s.held = false;

  if (within(barnAt(w, h), s)) {
    world.flock.splice(world.flock.indexOf(s), 1);
    if (!world.waiting) {
      world.waiting = true;
      return 'waiting';
    }
    world.waiting = false;
    const barn = barnAt(w, h);
    world.flock.push({
      x: barn.x + HOUSE_W / 2,
      y: barn.y + HOUSE_H,
      vx: SPEED,
      vy: SPEED * 0.4,
      big: 2,
      shorn: s.shorn,
      face: 1,
      step: 0,
      held: false,
    });
    world.merged += 1;
    return 'merged';
  }

  if (within(salonAt(w, h), s) && !s.shorn) {
    const salon = salonAt(w, h);
    s.shorn = true;
    s.x = salon.x + HOUSE_W / 2;
    s.y = salon.y + HOUSE_H;
    s.vx = -SPEED;
    world.bales.push({ x: salon.x + HOUSE_W + 4, y: salon.y + HOUSE_H - PX * 4 });
    world.shorn += 1;
    return 'shorn';
  }

  return 'none';
}

function within(house: { x: number; y: number }, s: Sheep): boolean {
  const cx = s.x + (SHEEP_W * s.big) / 2;
  const cy = s.y + (SHEEP_H * s.big) / 2;
  return cx > house.x && cx < house.x + HOUSE_W && cy > house.y && cy < house.y + HOUSE_H;
}
