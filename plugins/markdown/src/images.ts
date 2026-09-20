import { signal, type Signal } from '@preact/signals';

/** A file's bytes — the third layer of reading. */
export interface BytesWire {
  bytes(path: string, limit?: number): Promise<{ path: string; base64: string; bytes: number; truncated: boolean }>;
}

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

/**
 * Images inside markup.
 *
 * In the file they are named RELATIVE to it, while the page lives at the application's
 * address — put such a path in an `<img src>` and the browser goes to the wrong place
 * and silently draws a broken icon. So the path is computed from the file, and the
 * bytes arrive through the third layer of reading and turn into a `data:` URL.
 *
 * A class rather than a hook: a README may hold a dozen images, and redraws come on
 * every keystroke, so there is no point going after the same bytes twice.
 */
export class MarkdownImages {
  private readonly known = new Map<string, Signal<string | null>>();

  constructor(private readonly wire: BytesWire) {}

  /**
   * The address to show it by. External links are handed over as they are — the build
   * badges in a README are exactly that; our own we read from disk.
   */
  source(src: string, docPath: string): Signal<string | null> {
    if (/^(https?:|data:)/i.test(src)) return signalOf(src);
    const path = this.resolve(src, docPath);
    const mime = MIME[path.slice(path.lastIndexOf('.') + 1).toLowerCase()];
    if (!mime) return signalOf(null);

    const had = this.known.get(path);
    if (had) return had;
    const out = signal<string | null>(null);
    this.known.set(path, out);
    void this.wire
      .bytes(path)
      .then((answer) => (out.value = `data:${mime};base64,${answer.base64}`))
      .catch(() => (out.value = null));
    return out;
  }

  /**
   * A path from file to file, without `path` and without the DOM: protocol paths are
   * relative to the project root and always use a forward slash.
   */
  resolve(src: string, docPath: string): string {
    if (src.startsWith('/')) return src.slice(1);
    const parts = docPath.split('/').slice(0, -1);
    for (const step of src.split('/')) {
      if (step === '' || step === '.') continue;
      if (step === '..') parts.pop();
      else parts.push(step);
    }
    return parts.join('/');
  }
}

function signalOf(value: string | null): Signal<string | null> {
  const out = signal<string | null>(value);
  return out;
}
