import { useEffect, useRef, useState } from 'preact/hooks';
import {
  barnAt,
  createWorld,
  grab,
  HOUSE_H,
  HOUSE_W,
  moveHeld,
  PX,
  release,
  salonAt,
  SHEEP_H,
  SHEEP_W,
  step,
} from './sheep-world.js';
import { t } from '../i18n/index.js';

const MERGED_KEY = 'sheep.merged';
const SHORN_KEY = 'sheep.shorn';

const SHEEP = [
  '..wwww..',
  '.wwwwww.',
  'hwwwwwww',
  'hwwwwwww',
  '.l.ll.l.',
];

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
  h: '#3b3b3b',
  l: '#3b3b3b',
  r: '#8a4b3c',
  b: '#a86b4f',
  d: '#191919',
  p: '#6a8fb5',
  g: '#7e8a93',
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
      paint(ctx, BARN, barn.x, barn.y, PX * 2);
      paint(ctx, SALON, salon.x, salon.y, PX * 2);
      if (world.waiting) {
        paint(ctx, SHEEP, barn.x + HOUSE_W / 2 - SHEEP_W / 2, barn.y + HOUSE_H - SHEEP_H, PX);
      }
      for (const bale of world.bales) {
        ctx.fillStyle = COLORS.w!;
        ctx.fillRect(bale.x, bale.y, PX * 5, PX * 4);
        ctx.fillStyle = '#c9c3b8';
        ctx.fillRect(bale.x, bale.y + PX * 2, PX * 5, PX);
      }
      for (const s of world.flock) {
        const hop = Math.sin(s.step) > 0.6 ? -PX : 0;
        paint(
          ctx,
          SHEEP,
          s.x,
          s.y + (s.held ? -PX : hop),
          PX * s.big,
          s.face < 0,
          s.shorn ? { w: 's' } : undefined,
        );
      }
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
