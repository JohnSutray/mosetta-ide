import { signal, type Signal } from '@preact/signals';

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

export class MarkdownImages {
  private readonly known = new Map<string, Signal<string | null>>();

  constructor(private readonly wire: BytesWire) {}

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
