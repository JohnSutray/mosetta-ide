import { signal } from '@preact/signals';
import { keep, recall } from './persist.js';

export interface Size {
  w: number;
  h: number;
}

export class Geometry {
  readonly edge = 20;

  private readonly minPopup: Size = { w: 240, h: 160 };

  private readonly widthsKey = 'panel-widths';
  private readonly sizesKey = 'popup-sizes';

  readonly widths = signal<Record<string, number>>(this.readWidths());
  readonly popupSizes = signal<Record<string, Size>>(this.readSizes());

  readonly viewport = signal(this.measure());

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', () => {
      const now = this.measure();
      if (now.w !== this.viewport.value.w || now.h !== this.viewport.value.h) {
        this.viewport.value = now;
      }
    });
  }

  widthOf(id: string, fallback: number): number {
    return this.widths.value[id] ?? fallback;
  }

  setWidth(id: string, px: number, limits: { min: number; max: number }): void {
    const min = limits.min;
    const max = Math.max(min, limits.max);
    const width = Math.round(Math.min(max, Math.max(min, px)));
    if (this.widths.value[id] === width) return;
    this.widths.value = { ...this.widths.value, [id]: width };
    keep(this.widthsKey, this.widths.value);
  }

  sizeOf(id: string, fallback: Size): Size {
    const saved = this.popupSizes.value[id] ?? fallback;
    const box = this.viewport.value;
    return {
      w: Math.max(this.minPopup.w, Math.min(saved.w, box.w - this.edge * 2)),
      h: Math.max(this.minPopup.h, Math.min(saved.h, box.h - this.edge * 2)),
    };
  }

  setPopupSize(id: string, size: Size, min: Size): void {
    const next = {
      w: Math.round(Math.min(Math.max(size.w, min.w), this.viewport.value.w - this.edge * 2)),
      h: Math.round(Math.min(Math.max(size.h, min.h), this.viewport.value.h - this.edge * 2)),
    };
    const known = this.popupSizes.value[id];
    if (known && known.w === next.w && known.h === next.h) return;
    this.popupSizes.value = { ...this.popupSizes.value, [id]: next };
    keep(this.sizesKey, this.popupSizes.value);
  }

  resetPopupSize(id: string): void {
    const { [id]: _dropped, ...rest } = this.popupSizes.value;
    this.popupSizes.value = rest;
    keep(this.sizesKey, rest);
  }

  fitAnchored(
    want: Size,
    anchor: { x: number; y: number },
    box: Size,
    min: Size,
    gap = 6,
  ): { w: number; h: number; left: number; top: number } {
    const w = Math.min(want.w, box.w - this.edge * 2);
    const below = box.h - (anchor.y + gap) - this.edge;
    const above = anchor.y - gap - this.edge;
    const under = want.h <= below || below >= above;
    const room = Math.max(min.h, under ? below : above);
    const h = Math.max(min.h, Math.min(want.h, room));
    const top = Math.max(this.edge, under ? anchor.y + gap : anchor.y - gap - h);
    return {
      w: Math.round(w),
      h: Math.round(h),
      left: Math.round(Math.max(this.edge, Math.min(anchor.x, box.w - w - this.edge))),
      top: Math.round(Math.min(top, box.h - h - this.edge)),
    };
  }

  private readWidths(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(recall<Record<string, unknown>>('panel-widths', {}))) {
      if (typeof value === 'number' && Number.isFinite(value)) out[id] = value;
    }
    return out;
  }

  private readSizes(): Record<string, Size> {
    const out: Record<string, Size> = {};
    for (const [id, value] of Object.entries(recall<Record<string, unknown>>('popup-sizes', {}))) {
      const size = value as Size;
      if (size && Number.isFinite(size.w) && Number.isFinite(size.h)) out[id] = size;
    }
    return out;
  }

  private measure(): Size {
    if (typeof window === 'undefined') return { w: 1280, h: 720 };
    return { w: window.innerWidth, h: window.innerHeight };
  }
}

export const geometry = new Geometry();
