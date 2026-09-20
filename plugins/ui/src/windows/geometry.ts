import type { Signal } from '@preact/signals';
/** Memory across reloads — the widgets plugin's own `ide.remember`. */
export type Remember = <T>(key: string, initial: T) => Signal<T>;

/**
 * Geometry: the columns' widths and the windows' sizes.
 *
 * This is GEOMETRY rather than a setting: it changes by mouse dozens of times an hour
 * and belongs to a particular screen rather than to a project. So it does not travel in
 * the settings file and is not synced between machines — otherwise a wide monitor would
 * break the layout on a laptop. It lives in the tab's memory.
 *
 * The limits (`min`/`max`) arrive from OUTSIDE: for a column they are measured from the
 * window, for a resizer inside a dialog from the dialog's own width, and the store has
 * no business knowing about that.
 */

export interface Size {
  w: number;
  h: number;
}

export class Geometry {
  /**
   * The margin from any edge of the screen. A popup pressed flush against an edge looks
   * as if it has fallen off the screen, and its corner cannot be grabbed.
   */
  readonly edge = 20;

  /** Showing a popup smaller than this is pointless: the contents cannot be seen. */
  private readonly minPopup: Size = { w: 240, h: 160 };

  private readonly widthsKey = 'panel-widths';
  private readonly sizesKey = 'popup-sizes';

  readonly widths: Signal<Record<string, number>>;
  readonly popupSizes: Signal<Record<string, Size>>;

  /** The size of the mount point rather than of the browser window. */
  readonly viewport: { readonly value: Size };

  /**
   * The memory is the widgets plugin's `ide.remember`: the signal travels into the
   * store by itself.
   */
  constructor(remember: Remember, size: { readonly value: Size }) {
    this.viewport = size;
    this.widths = remember<Record<string, number>>(this.widthsKey, {});
    this.widths.value = this.cleanWidths(this.widths.peek());
    this.popupSizes = remember<Record<string, Size>>(this.sizesKey, {});
    this.popupSizes.value = this.cleanSizes(this.popupSizes.peek());
  }

  /**
   * The remembered width — or the one that was asked for.
   *
   * The default arrives as a PARAMETER rather than coming from the panel registry: a
   * geometry store has no business knowing that panels exist.
   */
  widthOf(id: string, fallback: number): number {
    return this.widths.value[id] ?? fallback;
  }

  /** Remember a width, clamped into the limits that were sent. */
  setWidth(id: string, px: number, limits: { min: number; max: number }): void {
    const min = limits.min;
    const max = Math.max(min, limits.max);
    const width = Math.round(Math.min(max, Math.max(min, px)));
    if (this.widths.value[id] === width) return;
    this.widths.value = { ...this.widths.value, [id]: width };
  }

  /**
   * A popup's size: the remembered one or the default, but always within the window. A
   * remembered 1100 pixels on a narrow laptop is a popup half of which cannot be seen
   * and none of which can be grabbed.
   */
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
  }

  /** A double click on the corner returns the default size. */
  resetPopupSize(id: string): void {
    const { [id]: _dropped, ...rest } = this.popupSizes.value;
    this.popupSizes.value = rest;
  }

  /**
   * Where and how big a popup holding on to a point in the text should stand.
   *
   * There is one rule and it reads as a promise: **we remember the wish and show as
   * much as fits.** Stretch a list across the whole screen while standing at the top of
   * a file — remembered; ask about a symbol near the bottom edge — shown above the
   * caret and exactly as tall as what is left. Go back to the top — full screen again.
   *
   * A pure method: without it this rule could only be checked by eye, and only at one
   * window size.
   */
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

  private cleanWidths(raw: Record<string, unknown>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value === 'number' && Number.isFinite(value)) out[id] = value;
    }
    return out;
  }

  private cleanSizes(raw: Record<string, unknown>): Record<string, Size> {
    const out: Record<string, Size> = {};
    for (const [id, value] of Object.entries(raw)) {
      const size = value as Size;
      if (size && Number.isFinite(size.w) && Number.isFinite(size.h)) out[id] = size;
    }
    return out;
  }
}
