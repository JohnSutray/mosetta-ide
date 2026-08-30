import { useEffect, useRef, useState } from 'preact/hooks';
import {
  barnAt,
  createWorld,
  grab,
  HOUSE_H,
  HOUSE_SCALE,
  HOUSE_W,
  MAX_LEVEL,
  moveHeld,
  PX,
  release,
  salonAt,
  SHEEP_H,
  SHEEP_W,
  step,
  type Sheep,
} from './world.js';
import { GLYPH_H, measure, write } from './pixel-font.js';
import { cell, setPixelRatio } from './pixel-grid.js';
import { t } from '@ide/api/client';

const DIGIT_FONT = "'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif";

const MERGED_KEY = 'sheep.merged';
const SHORN_KEY = 'sheep.shorn';
const PAUSED_KEY = 'sheep.paused';

const BODY = [
  '..wwww..',
  '.wwwwww.',
  'hhwwwwww',
  'hewwwwww',
  '.wwwwww.',
];

const LEGS = ['.l...l..', '..l.l...'];

const MINI = ['.mmm.', 'mmmmm', 'kmmmm', '.k.k.'];
const MINI_BALD = ['.nnn.', 'nnnnn', 'knnnn', '.k.k.'];
const PLUS = ['..k..', '.kkk.', '..k..'];
const EQUALS = ['kkk', '...', 'kkk'];
const SCISSORS = ['k...k', '.k.k.', '..k..', '.k.k.', 'k...k'];
const WOOL = ['mmmm', 'mmmm'];
const BIG = MINI;

const BARN = [
  '...rrrr...',
  '..rrrrrr..',
  '.rrrrrrrr.',
  'bbbbbbbbbb',
  'bbdddddbbb',
  'bbdddddbbb',
  'bbdddddbbb',
];

const SALON = [
  '....pp....',
  '...pppp...',
  '..pppppp..',
  'gggggggggg',
  'ggdddddggg',
  'ggdddddggg',
  'ggdddddggg',
];

const COLORS: Record<string, string> = {
  w: '#e8e4dc',
  s: '#e0a9a4',
  h: '#4a4a4a',
  e: '#0b0b0b',
  l: '#3b3b3b',
  '#': '#8d8880',
  r: '#8a4b3c',
  b: '#a86b4f',
  d: '#191919',
  p: '#6a8fb5',
  g: '#7e8a93',
  m: '#b3afa7',
  n: '#c79a96',
  k: '#7e8a93',
  barnReady: '#4a3520',
  barnOver: '#c98a3a',
  salonReady: '#26333f',
  salonOver: '#5fa0e0',
};

function paint(
  ctx: CanvasRenderingContext2D,
  art: string[],
  x: number,
  y: number,
  px: number,
  flip = false,
  swap?: Record<string, string>,
): void {
  art.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx += 1) {
      const raw = row[rx]!;
      if (raw === '.') continue;
      const key = swap?.[raw] ?? raw;
      ctx.fillStyle = COLORS[key] ?? '#fff';
      const cx = flip ? row.length - 1 - rx : rx;
      cell(ctx, x + cx * px, y + ry * px, px, px);
    }
  });
}

function drawSheep(ctx: CanvasRenderingContext2D, s: Sheep): void {
  const px = PX * s.level;
  const flip = s.face > 0;
  const swap = s.shorn ? { w: 's' } : undefined;
  paint(ctx, BODY, s.x, s.y, px, flip, swap);

  const phase = s.held ? Math.floor(s.panic) : Math.floor(s.step);
  paint(ctx, [LEGS[phase % LEGS.length]!], s.x, s.y + 5 * px, px, flip);

  if (s.level > 1) {
    const level = Math.min(s.level, MAX_LEVEL);
    ctx.fillStyle = s.shorn ? '#8a5a58' : '#8d8880';
    ctx.font = `600 ${Math.round(px * 2.4)}px ${DIGIT_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), s.x + (flip ? 2.2 : 5.8) * px, s.y + 2.6 * px);
  }
}

function drawSign(
  ctx: CanvasRenderingContext2D,
  house: { x: number; y: number },
  parts: string[][],
): void {
  const px = 2;
  const gap = 4;
  const scale = (art: string[], at: number) =>
    art === BIG && at === parts.length - 1 ? px * 1.6 : px;

  let width = 0;
  parts.forEach((art, at) => {
    width += art[0]!.length * scale(art, at) + gap;
  });
  width -= gap;

  let x = house.x + HOUSE_W / 2 - width / 2;
  const bottom = house.y - 10;
  for (let at = 0; at < parts.length; at += 1) {
    const art = parts[at]!;
    const px2 = scale(art, at);
    paint(ctx, art, x, bottom - art.length * px2, px2);
    x += art[0]!.length * px2 + gap;
  }
}

function drawShadow(ctx: CanvasRenderingContext2D, s: Sheep): void {
  const px = PX * s.level;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  cell(ctx, s.x + px, s.y + 6 * px, 6 * px, Math.max(2, px / 2));
}

function drawSwitch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  paused: boolean,
): { x: number; y: number; w: number; h: number } {
  const px = 2;
  const label = paused ? 'PASTURE CLOSED' : 'PASTURE OPEN';
  const text = measure(label, px);
  const pad = 8;
  const box = { x: Math.round(w / 2 - text / 2 - pad), y: Math.round(h - 46), w: text + pad * 2, h: GLYPH_H * px + pad };

  ctx.fillStyle = paused ? '#3a3d3f' : '#57472f';
  cell(ctx, box.x, box.y, box.w, box.h);
  ctx.fillStyle = paused ? '#4a4e50' : '#6b5638';
  cell(ctx, box.x, box.y, box.w, 2);
  ctx.fillStyle = '#4a3a26';
  cell(ctx, w / 2 - 2, box.y + box.h, 4, 12);
  write(ctx, label, box.x + pad, box.y + pad / 2, px, paused ? '#9aa2a8' : '#e8dcc4');

  if (paused) {
    const hint = 'CLICK TO OPEN';
    const hintPx = 2;
    write(
      ctx,
      hint,
      Math.round(w / 2 - measure(hint, hintPx) / 2),
      box.y - GLYPH_H * hintPx - 10,
      hintPx,
      '#79817f',
    );
  }
  return box;
}

function drawScore(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  merged: number,
  shorn: number,
): void {
  const px = 2;
  const line = `MERGED ${merged} · SHORN ${shorn}`;
  write(ctx, line, w - measure(line, px) - 12, h - 8 - GLYPH_H * px, px, '#5f6871');
}

function drawWords(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const title = t('editor.empty.title');
  const hint = t('editor.empty.hint');
  const titlePx = Math.max(1, Math.min(4, Math.floor((w * 0.82) / (measure(title, 1) || 1))));
  const hintPx = Math.max(1, Math.min(2, Math.floor((w * 0.7) / (measure(hint, 1) || 1))));

  write(ctx, title, w / 2 - measure(title, titlePx) / 2, h * 0.12, titlePx, '#9aa4ad');
  write(
    ctx,
    hint,
    w / 2 - measure(hint, hintPx) / 2,
    h * 0.12 + GLYPH_H * titlePx + 14,
    hintPx,
    '#6d757c',
  );
}

export function SheepField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [merged, setMerged] = useState(() => Number(localStorage.getItem(MERGED_KEY) ?? '0'));
  const [shorn, setShorn] = useState(() => Number(localStorage.getItem(SHORN_KEY) ?? '0'));
  const [, setPaused] = useState(() => localStorage.getItem(PAUSED_KEY) !== '0');

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const world = createWorld();
    world.merged = Number(localStorage.getItem(MERGED_KEY) ?? '0');
    world.shorn = Number(localStorage.getItem(SHORN_KEY) ?? '0');
    world.paused = localStorage.getItem(PAUSED_KEY) !== '0';
    let alive = true;

    const size = () => ({ w: el.clientWidth, h: el.clientHeight });

    const resize = () => {
      const { w, h } = size();
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.floor(w * ratio));
      el.height = Math.max(1, Math.floor(h * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
      setPixelRatio(ratio);
    };
    resize();

    let switchBox = { x: 0, y: 0, w: 0, h: 0 };

    const draw = () => {
      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
      drawWords(ctx, w, h);

      const barn = barnAt(w, h);
      const salon = salonAt(w, h);
      const held = world.held;
      const over = (house: { x: number; y: number }) =>
        held !== null &&
        held.x + (SHEEP_W * held.level) / 2 > house.x &&
        held.x + (SHEEP_W * held.level) / 2 < house.x + HOUSE_W &&
        held.y + (SHEEP_H * held.level) / 2 > house.y &&
        held.y + (SHEEP_H * held.level) / 2 < house.y + HOUSE_H;
      const door = (kind: 'barn' | 'salon', house: { x: number; y: number }) =>
        held === null ? undefined : { d: over(house) ? `${kind}Over` : `${kind}Ready` };
      paint(ctx, BARN, barn.x, barn.y, PX * HOUSE_SCALE, false, door('barn', barn));
      paint(ctx, SALON, salon.x, salon.y, PX * HOUSE_SCALE, false, door('salon', salon));

      if (world.paused) {
        switchBox = drawSwitch(ctx, w, h, true);
        drawScore(ctx, w, h, world.merged, world.shorn);
        return;
      }

      drawSign(ctx, barn, [MINI, PLUS, MINI, EQUALS, BIG]);
      drawSign(ctx, salon, [MINI, PLUS, SCISSORS, EQUALS, MINI_BALD, PLUS, WOOL]);
      const guest = world.waiting;
      if (guest) {
        drawSheep(ctx, {
          ...guest,
          x: barn.x + HOUSE_W / 2 - (SHEEP_W * guest.level) / 2,
          y: barn.y + HOUSE_H - SHEEP_H * guest.level,
          held: false,
        });
      }
      for (const bale of world.bales) {
        ctx.fillStyle = COLORS.w!;
        cell(ctx, bale.x, bale.y, PX * 5, PX * 4);
        ctx.fillStyle = '#c9c3b8';
        cell(ctx, bale.x, bale.y + PX * 2, PX * 5, PX);
      }
      for (const s of world.flock) drawShadow(ctx, s);
      for (const s of world.flock) drawSheep(ctx, s);

      switchBox = drawSwitch(ctx, w, h, world.paused);
      drawScore(ctx, w, h, world.merged, world.shorn);
    };

    const watcher = new ResizeObserver(() => {
      resize();
      draw();
    });
    watcher.observe(el);

    const STEP_MS = 1000 / 60;
    const MAX_DEBT = STEP_MS * 5;
    let clock = performance.now();
    let debt = 0;

    const tick = (now: number) => {
      if (!alive) return;
      requestAnimationFrame(tick);
      if (world.paused) {
        clock = now;
        return;
      }
      debt = Math.min(debt + (now - clock), MAX_DEBT);
      clock = now;
      const { w, h } = size();
      let moved = false;
      while (debt >= STEP_MS) {
        step(world, w, h);
        debt -= STEP_MS;
        moved = true;
      }
      if (moved) draw();
    };
    requestAnimationFrame(tick);

    const at = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const down = (event: PointerEvent) => {
      const p = at(event);
      if (
        p.x >= switchBox.x &&
        p.x <= switchBox.x + switchBox.w &&
        p.y >= switchBox.y &&
        p.y <= switchBox.y + switchBox.h
      ) {
        toggle();
        return;
      }
      if (world.paused) return;
      if (grab(world, p.x, p.y)) el.setPointerCapture(event.pointerId);
    };

    const toggle = () => {
      world.paused = !world.paused;
      localStorage.setItem(PAUSED_KEY, world.paused ? '1' : '0');
      if (world.paused) {
        world.flock.length = 0;
        world.waiting = null;
      } else {
        world.seeded = false;
      }
      setPaused(world.paused);
      draw();
    };

    const move = (event: PointerEvent) => {
      const p = at(event);
      moveHeld(world, p.x, p.y);
    };

    const up = () => {
      const { w, h } = size();
      const what = release(world, w, h);
      if (what === 'merged') {
        localStorage.setItem(MERGED_KEY, String(world.merged));
        setMerged(world.merged);
      }
      if (what === 'shorn') {
        localStorage.setItem(SHORN_KEY, String(world.shorn));
        setShorn(world.shorn);
      }
      void merged;
      void shorn;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    step(world, size().w, size().h);
    draw();

    return () => {
      alive = false;
      watcher.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div class="empty-editor">
      <canvas class="sheep-field" ref={canvas} />
    </div>
  );
}
