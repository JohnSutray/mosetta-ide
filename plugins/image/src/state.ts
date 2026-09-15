import { signal, type ReadonlySignal } from '@preact/signals';
import { ImageKinds } from './kinds.js';

export interface BytesWire {
  bytes(path: string, limit?: number): Promise<{ path: string; base64: string; bytes: number; truncated: boolean }>;
}

export interface Loaded {
  path: string;
  url: string;
  bytes: number;
  truncated: boolean;
  error: string | null;
}

export class ImageStore {
  readonly shown = signal<Loaded | null>(null);
  private token = 0;
  private readonly kinds = new ImageKinds();

  constructor(
    private readonly wire: BytesWire,
    private readonly describe: (err: unknown) => string,
  ) {}

  get file(): ReadonlySignal<Loaded | null> {
    return this.shown;
  }

  load(path: string): void {
    if (this.shown.value?.path === path) return;
    const token = ++this.token;
    this.shown.value = { path, url: '', bytes: 0, truncated: false, error: null };
    void this.wire
      .bytes(path)
      .then((answer) => {
        if (token !== this.token) return;
        this.shown.value = {
          path,
          url: `data:${this.kinds.mime(path)};base64,${answer.base64}`,
          bytes: answer.bytes,
          truncated: answer.truncated,
          error: null,
        };
      })
      .catch((err) => {
        if (token !== this.token) return;
        this.shown.value = { path, url: '', bytes: 0, truncated: false, error: this.describe(err) };
      });
  }
}
