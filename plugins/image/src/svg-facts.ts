/**
 * What useful things can be said about an SVG without drawing it.
 *
 * The parsing is deliberately shallow — expressions over the head of the file rather
 * than real XML: what we need is the canvas size and the order of magnitude, not a
 * tree. A mistake here costs one inexact line under the picture, whereas real parsing
 * would cost a dependency and time on every view.
 *
 * A pure class: no DOM, no network — so it is checked by a test rather than by eye.
 */
export interface SvgFacts {
  /** The canvas from `viewBox`; `null` means there is none, which is news in itself. */
  box: { width: number; height: number } | null;
  /** What the root's `width`/`height` say, as they are (`24`, `100%`, `1em`). */
  width: string | null;
  height: string | null;
  /** How many shapes are inside: they show whether this is an icon or a map of Europe. */
  shapes: number;
  /**
   * How many colours are named explicitly — a hint as to whether `currentColor` will
   * repaint.
   */
  colors: string[];
}

const SHAPES = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'use', 'image'];

export class SvgReader {
  facts(text: string): SvgFacts {
    const head = text.slice(0, 4096);
    const box = /viewBox\s*=\s*["']([^"']+)["']/i.exec(head)?.[1] ?? null;
    const numbers = box ? box.trim().split(/[\s,]+/).map(Number) : null;
    return {
      box:
        numbers && numbers.length === 4 && numbers.every((one) => Number.isFinite(one))
          ? { width: numbers[2]!, height: numbers[3]! }
          : null,
      width: this.attribute(head, 'width'),
      height: this.attribute(head, 'height'),
      shapes: this.shapes(text),
      colors: this.colors(text),
    };
  }

  /**
   * An attribute of the ROOT: we look in the first tag, otherwise we would catch a
   * nested one.
   */
  private attribute(head: string, name: string): string | null {
    const root = /<svg\b[^>]*>/i.exec(head)?.[0] ?? '';
    return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(root)?.[1] ?? null;
  }

  private shapes(text: string): number {
    let count = 0;
    for (const tag of SHAPES) count += text.match(new RegExp(`<${tag}\\b`, 'gi'))?.length ?? 0;
    return count;
  }

  /**
   * The named colours, without duplicates and in order of appearance. `currentColor`
   * counts among them — it is the most interesting answer of all: an icon with it will
   * be repainted by the theme, an icon with `#cb3837` will not.
   */
  private colors(text: string): string[] {
    const found = text.match(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}|currentColor|rgba?\([^)]*\))/gi) ?? [];
    const out: string[] = [];
    for (const one of found) {
      const value = /(#[0-9a-f]{3,8}|currentColor|rgba?\([^)]*\))/i.exec(one)?.[1];
      if (value && !out.includes(value)) out.push(value);
    }
    return out.slice(0, 6);
  }
}
