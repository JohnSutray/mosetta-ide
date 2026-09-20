import { signal, type ReadonlySignal } from '@preact/signals';
import { ImageKinds } from './kinds.js';

/** A file's bytes, as the OS layer hands them over. */
export interface BytesWire {
  bytes(path: string, limit?: number): Promise<{ path: string; base64: string; bytes: number; truncated: boolean }>;
}

export interface Loaded {
  path: string;
  /** A ready URL for `<img src>`; empty means it has not arrived yet. */
  url: string;
  bytes: number;
  truncated: boolean;
  error: string | null;
}

/**
 * What we are showing and where we got it from.
 *
 * A class of its own rather than hooks in a component: the bytes arrive over the
 * socket, the answer may be late, and the middle may have been switched to another file
 * meanwhile — that is, there is a real race here, and a request counter settles it, as
 * it does in search.
 */
export class ImageStore {
  readonly shown = signal<Loaded | null>(null);
  private token = 0;
  private readonly kinds = new ImageKinds();

  constructor(
    private readonly wire: BytesWire,
    /** Report trouble in words. Silent emptiness is worse than an error. */
    private readonly describe: (err: unknown) => string,
  ) {}

  get file(): ReadonlySignal<Loaded | null> {
    return this.shown;
  }

  /** Show this path. A repeated call about the same file does nothing. */
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
