export interface SvgFacts {
  box: { width: number; height: number } | null;
  width: string | null;
  height: string | null;
  shapes: number;
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

  private attribute(head: string, name: string): string | null {
    const root = /<svg\b[^>]*>/i.exec(head)?.[0] ?? '';
    return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(root)?.[1] ?? null;
  }

  private shapes(text: string): number {
    let count = 0;
    for (const tag of SHAPES) count += text.match(new RegExp(`<${tag}\\b`, 'gi'))?.length ?? 0;
    return count;
  }

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
