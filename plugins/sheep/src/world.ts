/**
 * The rules of the sheep field.
 *
 * Separate from the drawing, and not for elegance: a gimmick living only inside
 * `requestAnimationFrame` cannot be checked except by eye, and eyes see nothing in a
 * background tab — the browser counts no frames there. Here are pure functions: give a
 * state, get the next one. They can be run through a test in a millisecond.
 *
 * The drawing lives elsewhere and knows only how to show this state.
 */

export interface Sheep {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * The growth stage, 1…5. Every merge in the barn raises it by one, and it is also the
   * size multiplier: a fifth-stage sheep is five times the first.
   */
  level: number;
  shorn: boolean;
  /** Which way it faces: −1 left, 1 right. */
  face: number;
  /** The phase of the legs while walking. */
  step: number;
  /** The panic phase: while held, the legs flicker. */
  panic: number;
  held: boolean;
}

export interface Bale {
  x: number;
  y: number;
}

export interface World {
  flock: Sheep[];
  bales: Bale[];
  /** The first sheep are already placed. We wait for the field to have a size. */
  seeded: boolean;
  /**
   * The field is off. Constant movement on screen does not bother everyone, but those
   * it bothers, it bothers in earnest, and the switch has to be on the panel itself.
   */
  paused: boolean;
  /** Who is waiting in the barn for a partner: one sheep is not a merge yet. */
  waiting: Sheep | null;
  held: Sheep | null;
  merged: number;
  shorn: number;
  frame: number;
}

const CAP = 7;
/**
 * A step per frame. Slow — but not so slow that the first sheep takes a minute to reach
 * the middle: people look at the panel for seconds.
 */
const SPEED = 0.5;

/**
 * The gap between huts. It is deliberately large: the huts are two different answers to
 * "what shall I do with this sheep", and standing flush they read as one building, with
 * a sheep between them landing somewhere other than where it was carried.
 */
function gap(w: number): number {
  return Math.max(140, Math.round(w * 0.22));
}

/**
 * One does not walk through a house. We push out along whichever axis the sheep entered
 * least: that way it rounds the corner rather than bouncing back across the whole wall.
 *
 * This rule does not apply while it is being carried: carried means carried, including
 * inside. Otherwise the hut would repel the very thing it stands for.
 */
function keepOut(s: Sheep, house: { x: number; y: number }): void {
  const w = sheepfold.SHEEP_W * s.level;
  const h = sheepfold.SHEEP_H * s.level;
  const left = house.x - (s.x + w);
  const right = house.x + sheepfold.HOUSE_W - s.x;
  const top = house.y - (s.y + h);
  const bottom = house.y + sheepfold.HOUSE_H - s.y;
  if (left > 0 || right < 0 || top > 0 || bottom < 0) return;

  const out = [
    { d: -left, fix: () => { s.x = house.x - w; s.vx = -Math.abs(s.vx); } },
    { d: right, fix: () => { s.x = house.x + sheepfold.HOUSE_W; s.vx = Math.abs(s.vx); } },
    { d: -top, fix: () => { s.y = house.y - h; s.vy = -Math.abs(s.vy); } },
    { d: bottom, fix: () => { s.y = house.y + sheepfold.HOUSE_H; s.vy = Math.abs(s.vy); } },
  ].sort((a, b) => a.d - b.d)[0]!;
  out.fix();
}

/**
 * Collided means parted. TURNED AROUND specifically rather than nudged: the speed is
 * normalised to a constant afterwards, and a weak nudge is erased by it — two sheep
 * would have gone on travelling side by side, flanks touching (caught by a test).
 */
function bump(a: Sheep, b: Sheep): void {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const near = (sheepfold.SHEEP_W * (a.level + b.level)) / 2.6;
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

/** What happened on release — which is the entire point of the huts. */
export type Drop = 'none' | 'waiting' | 'merged' | 'shorn';

function within(house: { x: number; y: number }, s: Sheep): boolean {
  const cx = s.x + (sheepfold.SHEEP_W * s.level) / 2;
  const cy = s.y + (sheepfold.SHEEP_H * s.level) / 2;
  return cx > house.x && cx < house.x + sheepfold.HOUSE_W && cy > house.y && cy < house.y + sheepfold.HOUSE_H;
}

/** The mechanics of the sheep world: time rather than frames. */
export class Sheepfold {
  /** The size of a sprite "pixel", and the dimensions in those pixels. */
  readonly PX = 4;

  readonly SHEEP_W = 8 * this.PX;

  readonly SHEEP_H = 6 * this.PX;

  /** The huts are bigger than a sheep: one goes into them, not the other way round. */
  readonly HOUSE_SCALE = 3;

  readonly HOUSE_W = 10 * this.PX * this.HOUSE_SCALE;

  readonly HOUSE_H = 7 * this.PX * this.HOUSE_SCALE;

  /** We grow no taller: a fifth-stage sheep already fills half a hut. */
  readonly MAX_LEVEL = 5;

  /**
   * The margin around a sheep by which it can also be grabbed. One aims at a running
   * figure with a mouse — missing by a pixel should not cost another attempt.
   */
  readonly GRAB_PAD = 10;

  /** Frames between arrivals. The flock gathers itself rather than tumbling in at once. */
  readonly SPAWN_EVERY = 180;

  create(): World {
    return { flock: [], bales: [], seeded: false, paused: false, waiting: null, held: null, merged: 0, shorn: 0, frame: 0 };
  }

  barnAt(w: number, h: number) {
    return { x: w / 2 - this.HOUSE_W - gap(w) / 2, y: h / 2 - this.HOUSE_H / 2 };
  }

  salonAt(w: number, h: number) {
    return { x: w / 2 + gap(w) / 2, y: h / 2 - this.HOUSE_H / 2 };
  }

  /**
   * They arrive FROM BEYOND the edge: the field is populated rather than pre-populated.
   *
   * The exception is the first few: a panel looked at for three seconds showing two
   * empty huts says nothing about sheep. Those are already here, and the rest of the
   * flock arrives on its own.
   */
  spawn(world: World, w: number, h: number, roll = Math.random, inside = false): void {
    if (world.flock.length >= CAP || w < 80 || h < 60) return;
    const fromLeft = roll() < 0.5;
    world.flock.push({
      x: inside
        ? 20 + roll() * Math.max(1, w - 80)
        : fromLeft
          ? -this.SHEEP_W
          : w + this.SHEEP_W,
      y: 20 + roll() * Math.max(1, h - 60),
      vx: (fromLeft ? 1 : -1) * SPEED,
      vy: (roll() - 0.5) * SPEED,
      level: 1,
      shorn: false,
      face: fromLeft ? 1 : -1,
      step: roll() * 10,
      panic: 0,
      held: false,
    });
  }

  step(world: World, w: number, h: number, roll = Math.random): void {
    world.frame += 1;
    if (!world.seeded && w >= 80 && h >= 60) {
      world.seeded = true;
      this.spawn(world, w, h, roll, true);
      this.spawn(world, w, h, roll, true);
      this.spawn(world, w, h, roll, true);
    }
    if (world.frame % this.SPAWN_EVERY === 0) this.spawn(world, w, h, roll);

    for (const s of world.flock) {
      if (s.held) {
        s.panic += 0.5;
        continue;
      }
      if (roll() < 0.01) {
        s.vx += (roll() - 0.5) * 0.1;
        s.vy += (roll() - 0.5) * 0.1;
      }
      const speed = Math.hypot(s.vx, s.vy);
      const want = SPEED / (1 + (s.level - 1) * 0.35);
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
      if (s.x + this.SHEEP_W * s.level > w && s.vx > 0) s.vx = -Math.abs(s.vx);
      if (s.y < 0 && s.vy < 0) s.vy = Math.abs(s.vy);
      if (s.y + this.SHEEP_H * s.level > h && s.vy > 0) s.vy = -Math.abs(s.vy);
    }

    for (let i = 0; i < world.flock.length; i += 1) {
      for (let j = i + 1; j < world.flock.length; j += 1) bump(world.flock[i]!, world.flock[j]!);
    }
    for (const s of world.flock) {
      if (s.held) continue;
      keepOut(s, this.barnAt(w, h));
      keepOut(s, this.salonAt(w, h));
    }
  }

  grab(world: World, x: number, y: number): boolean {
    for (let i = world.flock.length - 1; i >= 0; i -= 1) {
      const s = world.flock[i]!;
      if (
        x >= s.x - this.GRAB_PAD &&
        x <= s.x + this.SHEEP_W * s.level + this.GRAB_PAD &&
        y >= s.y - this.GRAB_PAD &&
        y <= s.y + this.SHEEP_H * s.level + this.GRAB_PAD
      ) {
        world.held = s;
        s.held = true;
        s.panic = 0;
        return true;
      }
    }
    return false;
  }

  moveHeld(world: World, x: number, y: number): void {
    const s = world.held;
    if (!s) return;
    s.x = x - (this.SHEEP_W * s.level) / 2;
    s.y = y - (this.SHEEP_H * s.level) / 2;
  }

  release(world: World, w: number, h: number): Drop {
    const s = world.held;
    world.held = null;
    if (!s) return 'none';
    s.held = false;

    if (within(this.barnAt(w, h), s)) {
      world.flock.splice(world.flock.indexOf(s), 1);
      if (!world.waiting) {
        world.waiting = s;
        return 'waiting';
      }
      const together = Math.min(this.MAX_LEVEL, Math.max(world.waiting.level, s.level) + 1);
      const shorn = world.waiting.shorn && s.shorn;
      world.waiting = null;
      const barn = this.barnAt(w, h);
      world.flock.push({
        x: barn.x + this.HOUSE_W / 2,
        y: barn.y + this.HOUSE_H + 2,
        vx: SPEED,
        vy: SPEED * 0.4,
        level: together,
        shorn,
        face: 1,
        step: 0,
        panic: 0,
        held: false,
      });
      world.merged += 1;
      return 'merged';
    }

    if (within(this.salonAt(w, h), s) && !s.shorn) {
      const salon = this.salonAt(w, h);
      s.shorn = true;
      s.x = salon.x + this.HOUSE_W / 2;
      s.y = salon.y + this.HOUSE_H + 2;
      s.vx = -SPEED;
      world.bales.push({ x: salon.x + this.HOUSE_W + 4, y: salon.y + this.HOUSE_H - this.PX * 4 });
      world.shorn += 1;
      return 'shorn';
    }

    return 'none';
  }
}

/** One per plugin: the world itself arrives as a parameter, the mechanics hold no state. */
export const sheepfold = new Sheepfold();
