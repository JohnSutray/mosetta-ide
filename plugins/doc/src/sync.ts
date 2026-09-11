import { RpcErrorCode, type DocState } from '@mosetta/ide-protocol';
import type { DocWire } from '@mosetta/ide-api/client';

export class DocSync {
  private path: string | null = null;
  private version_ = 0;
  private pending: string | null = null;
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: Promise<void> | null = null;

  constructor(
    private readonly wire: Pick<DocWire, 'edit'>,
    private readonly onError: (message: string) => void,
    private readonly onStale: () => void = () => undefined,
    private readonly debounceMs = 150,
  ) {}

  get version(): number {
    return this.version_;
  }

  get busy(): boolean {
    return this.inFlight || this.pending !== null || this.timer !== null;
  }

  attach(doc: DocState): void {
    this.cancel();
    this.path = doc.path;
    this.version_ = doc.version;
  }

  detach(): void {
    this.cancel();
    this.path = null;
  }

  edit(text: string): void {
    if (!this.path) return;
    this.pending = text;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.push();
    while (this.flight || (this.pending !== null && this.path)) {
      await (this.flight ?? this.push());
    }
  }

  private async push(): Promise<void> {
    if (this.inFlight || this.pending === null || !this.path) return;
    const text = this.pending;
    this.pending = null;
    this.inFlight = true;
    let landed: () => void = () => undefined;
    this.flight = new Promise<void>((resolve) => (landed = resolve));
    try {
      const result = await this.wire.edit(this.path, text, this.version_);
      this.version_ = result.version;
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined;
      if (code === RpcErrorCode.StaleVersion) {
        this.pending = null;
        this.onStale();
        return;
      }
      this.onError(err instanceof Error ? err.message : String(err));
    } finally {
      this.inFlight = false;
      this.flight = null;
      landed();
      if (this.pending !== null) await this.push();
    }
  }

  private cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = null;
  }
}
