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
} from './sheep-world.js';
import { t } from '../i18n/index.js';

const DIGIT_FONT = "'Inter', 'SF Pro Text', -apple-system, 'Segoe UI', Roboto, sans-serif";

const MERGED_KEY = 'sheep.merged';
const SHORN_KEY = 'sheep.shorn';

const BODY = [
  '..wwww..',
  '.wwwwww.',
  'hhwwwwww',
  'hewwwwww',
  '.wwwwww.',
];

const LEGS = ['.l...l..', '..l.l...'];

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
      ctx.fillRect(Math.round(x + cx * px), Math.round(y + ry * px), px, px);
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

export function SheepField() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [merged, setMerged] = useState(() => Number(localStorage.getItem(MERGED_KEY) ?? '0'));
  const [shorn, setShorn] = useState(() => Number(localStorage.getItem(SHORN_KEY) ?? '0'));

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;

    const world = createWorld();
    world.merged = Number(localStorage.getItem(MERGED_KEY) ?? '0');
    world.shorn = Number(localStorage.getItem(SHORN_KEY) ?? '0');
    let alive = true;

    const size = () => ({ w: el.clientWidth, h: el.clientHeight });

    const resize = () => {
      const { w, h } = size();
      const ratio = window.devicePixelRatio || 1;
      el.width = Math.max(1, Math.floor(w * ratio));
      el.height = Math.max(1, Math.floor(h * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const watcher = new ResizeObserver(resize);
    watcher.observe(el);

    const draw = () => {
      const { w, h } = size();
      ctx.clearRect(0, 0, w, h);
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
        ctx.fillRect(bale.x, bale.y, PX * 5, PX * 4);
        ctx.fillStyle = '#c9c3b8';
        ctx.fillRect(bale.x, bale.y + PX * 2, PX * 5, PX);
      }
      for (const s of world.flock) drawSheep(ctx, s);
    };

    const tick = () => {
      if (!alive) return;
      const { w, h } = size();
      step(world, w, h);
      draw();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const at = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      return { x: event.clientX - box.left, y: event.clientY - box.top };
    };

    const down = (event: PointerEvent) => {
      const p = at(event);
      if (grab(world, p.x, p.y)) el.setPointerCapture(event.pointerId);
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
      <div class="empty-words">
        <div class="empty-title">{t('editor.empty.title')}</div>
        <div class="empty-hint">{t('editor.empty.hint')}</div>
      </div>
      <canvas class="sheep-field" ref={canvas} />
      <div class="empty-score">
        {t('editor.empty.score', { merged: String(merged), shorn: String(shorn) })}
      </div>
    </div>
  );
}
