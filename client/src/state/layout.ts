import { signal } from '@preact/signals';
import { PANELS } from '../ui/panels.js';

const STORAGE_KEY = 'web-ide.panel-widths';

function initial(): Record<string, number> {
  const widths: Record<string, number> = {};
  for (const panel of PANELS) widths[panel.id] = panel.defaultWidth;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>;
    for (const [id, value] of Object.entries(saved)) {
      if (typeof value === 'number' && Number.isFinite(value)) widths[id] = value;
    }
  } catch {}
  return widths;
}

export const panelWidths = signal<Record<string, number>>(initial());

export function widthOf(id: string, fallback?: number): number {
  return (
    panelWidths.value[id] ??
    fallback ??
    PANELS.find((p) => p.id === id)?.defaultWidth ??
    260
  );
}

export function setWidth(id: string, px: number, limits: { min: number; max: number }): void {
  const min = limits.min;
  const max = Math.max(min, limits.max);
  const width = Math.round(Math.min(max, Math.max(min, px)));
  if (panelWidths.value[id] === width) return;
  panelWidths.value = { ...panelWidths.value, [id]: width };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelWidths.value));
  } catch {}
}

export function setPanelWidth(id: string, px: number): void {
  const panel = PANELS.find((item) => item.id === id);
  const min = panel?.minWidth ?? 150;
  setWidth(id, px, { min, max: window.innerWidth - 320 });
}

const SIZE_KEY = 'web-ide.popup-sizes';

export interface Size {
  w: number;
  h: number;
}

function initialSizes(): Record<string, Size> {
  try {
    const saved = JSON.parse(localStorage.getItem(SIZE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, Size> = {};
    for (const [id, value] of Object.entries(saved)) {
      const size = value as Size;
      if (size && Number.isFinite(size.w) && Number.isFinite(size.h)) out[id] = size;
    }
    return out;
  } catch {
    return {};
  }
}

export const popupSizes = signal<Record<string, Size>>(initialSizes());

export const viewport = signal(measure());

function measure(): Size {
  if (typeof window === 'undefined') return { w: 1280, h: 720 };
  return { w: window.innerWidth, h: window.innerHeight };
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    const now = measure();
    if (now.w !== viewport.value.w || now.h !== viewport.value.h) viewport.value = now;
  });
}

export const EDGE = 20;

export function sizeOf(id: string, fallback: Size): Size {
  const saved = popupSizes.value[id] ?? fallback;
  const box = viewport.value;
  return {
    w: Math.max(240, Math.min(saved.w, box.w - EDGE * 2)),
    h: Math.max(160, Math.min(saved.h, box.h - EDGE * 2)),
  };
}

export function fitAnchored(
  want: Size,
  anchor: { x: number; y: number },
  box: Size,
  min: Size,
  gap = 6,
): { w: number; h: number; left: number; top: number } {
  const w = Math.min(want.w, box.w - EDGE * 2);
  const below = box.h - (anchor.y + gap) - EDGE;
  const above = anchor.y - gap - EDGE;
  const under = want.h <= below || below >= above;
  const room = Math.max(min.h, under ? below : above);
  const h = Math.max(min.h, Math.min(want.h, room));
  const top = Math.max(EDGE, under ? anchor.y + gap : anchor.y - gap - h);
  return {
    w: Math.round(w),
    h: Math.round(h),
    left: Math.round(Math.max(EDGE, Math.min(anchor.x, box.w - w - EDGE))),
    top: Math.round(Math.min(top, box.h - h - EDGE)),
  };
}

export function setPopupSize(id: string, size: Size, min: Size): void {
  const next = {
    w: Math.round(Math.min(Math.max(size.w, min.w), viewport.value.w - EDGE * 2)),
    h: Math.round(Math.min(Math.max(size.h, min.h), viewport.value.h - EDGE * 2)),
  };
  const known = popupSizes.value[id];
  if (known && known.w === next.w && known.h === next.h) return;
  popupSizes.value = { ...popupSizes.value, [id]: next };
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(popupSizes.value));
  } catch {}
}

export function resetPopupSize(id: string): void {
  const { [id]: _dropped, ...rest } = popupSizes.value;
  popupSizes.value = rest;
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(rest));
  } catch {}
}
