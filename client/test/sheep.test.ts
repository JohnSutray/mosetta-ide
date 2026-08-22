import { describe, expect, it } from 'vitest';
import {
  barnAt,
  createWorld,
  grab,
  HOUSE_H,
  HOUSE_W,
  moveHeld,
  release,
  salonAt,
  SHEEP_H,
  SHEEP_W,
  spawn,
  step,
  type World,
} from '../src/ui/sheep-world.js';

const W = 600;
const H = 400;

const steady = () => 0.5;

function walk(world: World, frames: number): void {
  for (let i = 0; i < frames; i += 1) step(world, W, H, steady);
}

function put(world: World, x: number, y: number): void {
  const s = world.flock[0]!;
  s.x = x;
  s.y = y;
  grab(world, x + 1, y + 1);
  moveHeld(world, x, y);
}

describe('овцы', () => {
  it('появляются, когда у поля появился размер, а не при создании мира', () => {
    const world = createWorld();
    step(world, 0, 0, steady);
    expect(world.flock).toHaveLength(0);
    step(world, W, H, steady);
    expect(world.flock.length).toBeGreaterThan(0);
    for (const s of world.flock) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(W);
    }
  });

  it('приходят из-за края и заходят внутрь', () => {
    const world = createWorld();
    spawn(world, W, H, () => 0.1);
    const sheep = world.flock[0]!;
    expect(sheep.x).toBeLessThan(0);
    walk(world, 200);
    expect(sheep.x).toBeGreaterThan(0);
  });

  it('не стоят на месте, даже если погасили скорость', () => {
    const world = createWorld();
    spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.vx = 0;
    sheep.vy = 0;
    walk(world, 2);
    expect(Math.hypot(sheep.vx, sheep.vy)).toBeGreaterThan(0);
  });

  it('сталкиваются и разбегаются', () => {
    const world = createWorld();
    spawn(world, W, H, steady);
    spawn(world, W, H, steady);
    const [a, b] = world.flock as [typeof world.flock[0], typeof world.flock[0]];
    a.x = 100;
    a.y = 100;
    b.x = 104;
    b.y = 100;
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    walk(world, 30);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(before);
  });

  it('первая в сарае ждёт, вторая сливается с ней в большую', () => {
    const world = createWorld();
    const barn = barnAt(W, H);
    const middle = { x: barn.x + HOUSE_W / 2 - SHEEP_W / 2, y: barn.y + HOUSE_H / 2 - SHEEP_H / 2 };

    spawn(world, W, H, steady);
    put(world, middle.x, middle.y);
    expect(release(world, W, H)).toBe('waiting');
    expect(world.flock).toHaveLength(0);
    expect(world.merged).toBe(0);

    spawn(world, W, H, steady);
    put(world, middle.x, middle.y);
    expect(release(world, W, H)).toBe('merged');
    expect(world.merged).toBe(1);
    expect(world.flock).toHaveLength(1);
    expect(world.flock[0]!.big).toBe(2);
  });

  it('в парикмахерской стригут и роняют брикет шерсти', () => {
    const world = createWorld();
    const salon = salonAt(W, H);
    spawn(world, W, H, steady);
    put(world, salon.x + HOUSE_W / 2 - SHEEP_W / 2, salon.y + HOUSE_H / 2 - SHEEP_H / 2);
    expect(release(world, W, H)).toBe('shorn');
    expect(world.flock[0]!.shorn).toBe(true);
    expect(world.bales).toHaveLength(1);
    expect(world.shorn).toBe(1);
  });

  it('стриженую второй раз не стригут', () => {
    const world = createWorld();
    const salon = salonAt(W, H);
    spawn(world, W, H, steady);
    world.flock[0]!.shorn = true;
    put(world, salon.x + HOUSE_W / 2 - SHEEP_W / 2, salon.y + HOUSE_H / 2 - SHEEP_H / 2);
    expect(release(world, W, H)).toBe('none');
    expect(world.shorn).toBe(0);
  });

  it('брошенная в чистом поле просто идёт дальше', () => {
    const world = createWorld();
    spawn(world, W, H, steady);
    put(world, 20, 20);
    expect(release(world, W, H)).toBe('none');
    expect(world.flock).toHaveLength(1);
  });
});
