import { describe, expect, it } from 'vitest';
import { sheepfold, type World } from '../src/world.js';

const W = 600;
const H = 400;

const steady = () => 0.5;

function walk(world: World, frames: number): void {
  for (let i = 0; i < frames; i += 1) sheepfold.step(world, W, H, steady);
}

function put(world: World, x: number, y: number): void {
  const s = world.flock[0]!;
  s.x = x;
  s.y = y;
  sheepfold.grab(world, x + 1, y + 1);
  sheepfold.moveHeld(world, x, y);
}

describe('овцы', () => {
  it('появляются, когда у поля появился размер, а не при создании мира', () => {
    const world = sheepfold.create();
    sheepfold.step(world, 0, 0, steady);
    expect(world.flock).toHaveLength(0);
    sheepfold.step(world, W, H, steady);
    expect(world.flock.length).toBeGreaterThan(0);
    for (const s of world.flock) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(W);
    }
  });

  it('приходят из-за края и заходят внутрь', () => {
    const world = sheepfold.create();
    sheepfold.spawn(world, W, H, () => 0.1);     const sheep = world.flock[0]!;
    expect(sheep.x).toBeLessThan(0);
    walk(world, 200);
    expect(sheep.x).toBeGreaterThan(0);
  });

  it('не стоят на месте, даже если погасили скорость', () => {
    const world = sheepfold.create();
    sheepfold.spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.vx = 0;
    sheep.vy = 0;
    walk(world, 2);
    expect(Math.hypot(sheep.vx, sheep.vy)).toBeGreaterThan(0);
  });

  it('сталкиваются и разбегаются', () => {
    const world = sheepfold.create();
    sheepfold.spawn(world, W, H, steady);
    sheepfold.spawn(world, W, H, steady);
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
    const world = sheepfold.create();
    const barn = sheepfold.barnAt(W, H);
    const middle = { x: barn.x + sheepfold.HOUSE_W / 2 - sheepfold.SHEEP_W / 2, y: barn.y + sheepfold.HOUSE_H / 2 - sheepfold.SHEEP_H / 2 };

    sheepfold.spawn(world, W, H, steady);
    put(world, middle.x, middle.y);
    expect(sheepfold.release(world, W, H)).toBe('waiting');
    expect(world.flock).toHaveLength(0);
    expect(world.merged).toBe(0);

    sheepfold.spawn(world, W, H, steady);
    put(world, middle.x, middle.y);
    expect(sheepfold.release(world, W, H)).toBe('merged');
    expect(world.merged).toBe(1);
    expect(world.flock).toHaveLength(1);
    expect(world.flock[0]!.level).toBe(2);
  });

  it('слияние поднимает на ступень, но не выше пятой', () => {
    const barn = sheepfold.barnAt(W, H);

    const bring = (world: World, level: number) => {
      sheepfold.spawn(world, W, H, steady);
      const fresh = world.flock[world.flock.length - 1]!;
      fresh.level = level;
      fresh.x = barn.x + sheepfold.HOUSE_W / 2 - (sheepfold.SHEEP_W * level) / 2;
      fresh.y = barn.y + sheepfold.HOUSE_H / 2 - (sheepfold.SHEEP_H * level) / 2;
      sheepfold.grab(world, fresh.x + 1, fresh.y + 1);
      return sheepfold.release(world, W, H);
    };

    for (const [waiting, coming, want] of [
      [1, 1, 2],
      [2, 1, 3],
      [3, 3, 4],
      [4, 2, 5],
      [5, 5, 5],
      [5, 1, 5],
    ] as Array<[number, number, number]>) {
      const world = sheepfold.create();
      expect(bring(world, waiting)).toBe('waiting');
      expect(bring(world, coming)).toBe('merged');
      expect(world.flock[0]!.level, `${waiting}+${coming}`).toBe(want);
    }
  });

  it('схватить можно и рядом с овцой, не только точно по ней', () => {
    const world = sheepfold.create();
    sheepfold.spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = 100;
    sheep.y = 100;
    expect(sheepfold.grab(world, 100 - sheepfold.GRAB_PAD + 2, 100 - sheepfold.GRAB_PAD + 2)).toBe(true);
    world.held = null;
    sheep.held = false;
    expect(sheepfold.grab(world, 100 - sheepfold.GRAB_PAD * 3, 100)).toBe(false);
  });

  it('сквозь домик не ходят, а обходят', () => {
    const world = sheepfold.create();
    const barn = sheepfold.barnAt(W, H);
    sheepfold.spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = barn.x + 4;
    sheep.y = barn.y + sheepfold.HOUSE_H / 2;
    sheep.vx = 1;
    sheep.vy = 0;
    walk(world, 40);
    const inside =
      sheep.x + sheepfold.SHEEP_W > barn.x &&
      sheep.x < barn.x + sheepfold.HOUSE_W &&
      sheep.y + sheepfold.SHEEP_H > barn.y &&
      sheep.y < barn.y + sheepfold.HOUSE_H;
    expect(inside).toBe(false);
  });

  it('на руках домик не отбивает: несут — значит несут', () => {
    const world = sheepfold.create();
    const barn = sheepfold.barnAt(W, H);
    sheepfold.spawn(world, W, H, steady);
    const sheep = world.flock[0]!;
    sheep.x = barn.x + sheepfold.HOUSE_W / 2 - sheepfold.SHEEP_W / 2;
    sheep.y = barn.y + sheepfold.HOUSE_H / 2 - sheepfold.SHEEP_H / 2;
    sheepfold.grab(world, sheep.x + 1, sheep.y + 1);
    walk(world, 10);
    expect(sheep.x).toBe(barn.x + sheepfold.HOUSE_W / 2 - sheepfold.SHEEP_W / 2);
    expect(sheepfold.release(world, W, H)).toBe('waiting');
  });

  it('в парикмахерской стригут и роняют брикет шерсти', () => {
    const world = sheepfold.create();
    const salon = sheepfold.salonAt(W, H);
    sheepfold.spawn(world, W, H, steady);
    put(world, salon.x + sheepfold.HOUSE_W / 2 - sheepfold.SHEEP_W / 2, salon.y + sheepfold.HOUSE_H / 2 - sheepfold.SHEEP_H / 2);
    expect(sheepfold.release(world, W, H)).toBe('shorn');
    expect(world.flock[0]!.shorn).toBe(true);
    expect(world.bales).toHaveLength(1);
    expect(world.shorn).toBe(1);
  });

  it('стриженую второй раз не стригут', () => {
    const world = sheepfold.create();
    const salon = sheepfold.salonAt(W, H);
    sheepfold.spawn(world, W, H, steady);
    world.flock[0]!.shorn = true;
    put(world, salon.x + sheepfold.HOUSE_W / 2 - sheepfold.SHEEP_W / 2, salon.y + sheepfold.HOUSE_H / 2 - sheepfold.SHEEP_H / 2);
    expect(sheepfold.release(world, W, H)).toBe('none');
    expect(world.shorn).toBe(0);
  });

  it('брошенная в чистом поле просто идёт дальше', () => {
    const world = sheepfold.create();
    sheepfold.spawn(world, W, H, steady);
    put(world, 20, 20);
    expect(sheepfold.release(world, W, H)).toBe('none');
    expect(world.flock).toHaveLength(1);
  });
});
