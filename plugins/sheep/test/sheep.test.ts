import { describe, expect, it } from 'vitest';
import {
  barnAt,
  createWorld,
  grab,
  GRAB_PAD,
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
} from '../src/world.js';

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
    expect(world.flock[0]!.level).toBe(2);
  });

  it('слияние поднимает на ступень, но не выше пятой', () => {
    const barn = barnAt(W, H);

    const bring = (world: World, level: number) => {
      spawn(world, W, H, steady);
      const fresh = world.flock[world.flock.length - 1]!;
      fresh.level = level;
      fresh.x = barn.x + HOUSE_W / 2 - (SHEEP_W * level) / 2;
      fresh.y = barn.y + HOUSE_H / 2 - (SHEEP_H * level) / 2;
      grab(world, fresh.x + 1, fresh.y + 1);
      return release(world, W, H);
    };

    for (const [waiting, coming, want] of [
      [1, 1, 2],
      [2, 1, 3],
      [3, 3, 4],
      [4, 2, 5],
      [5, 5, 5],
      [5, 1, 5],
    ] as Array<[number, number, number]>) {
      const world = createWorld();
      expect(bring(world, waiting)).toBe('waiting');
      expect(bring(world, coming)).toBe('merged');
      expect(world.flock[0]!.level, `${waiting}+${coming}`).toBe(want);
    }
  });

  it('схватить можно и рядом с овцой, не только точно по ней', () => {
    const world = createWorld();
    spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = 100;
    sheep.y = 100;
    expect(grab(world, 100 - GRAB_PAD + 2, 100 - GRAB_PAD + 2)).toBe(true);
    world.held = null;
    sheep.held = false;
    expect(grab(world, 100 - GRAB_PAD * 3, 100)).toBe(false);
  });

  it('сквозь домик не ходят, а обходят', () => {
    const world = createWorld();
    const barn = barnAt(W, H);
    spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = barn.x + 4;
    sheep.y = barn.y + HOUSE_H / 2;
    sheep.vx = 1;
    sheep.vy = 0;
    walk(world, 40);
    const inside =
      sheep.x + SHEEP_W > barn.x &&
      sheep.x < barn.x + HOUSE_W &&
      sheep.y + SHEEP_H > barn.y &&
      sheep.y < barn.y + HOUSE_H;
    expect(inside).toBe(false);
  });

  it('на руках домик не отбивает: несут — значит несут', () => {
    const world = createWorld();
    const barn = barnAt(W, H);
    spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = barn.x + HOUSE_W / 2 - SHEEP_W / 2;
    sheep.y = barn.y + HOUSE_H / 2 - SHEEP_H / 2;
    grab(world, sheep.x + 1, sheep.y + 1);
    walk(world, 10);
    expect(sheep.x).toBe(barn.x + HOUSE_W / 2 - SHEEP_W / 2);
    expect(release(world, W, H)).toBe('waiting');
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
