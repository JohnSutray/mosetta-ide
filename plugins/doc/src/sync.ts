import { RpcErrorCode, type DocState } from '@mosetta/ide-protocol';
import type { DocWire } from '@mosetta/ide-api/client';

/**
 * Sending edits into the server's memory layer.
 *
 * The text's owner is CodeMirror's state; text arrives here in order to travel to the
 * server and never goes back into the editor. The document's version lives here too
 * rather than in signals: it changes on every keystroke, and there is no point
 * redrawing the interface for it.
 *
 * Edits are glued together by a pause: a language server needs the text after the human
 * has stopped rather than thirty times a second.
 */
export class DocSync {
  private path: string | null = null;
  private version_ = 0;
  private pending: string | null = null;
  private inFlight = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** An edit in flight: `flush` waits for it rather than only for its own. */
  private flight: Promise<void> | null = null;

  constructor(
    private readonly wire: Pick<DocWire, 'edit'>,
    private readonly onError: (message: string) => void,
    /** The document moved ahead under our edit — another tab. */
    private readonly onStale: () => void = () => undefined,
    private readonly debounceMs = 150,
  ) {}

  /** The version we count from: the last one the server confirmed. */
  get version(): number {
    return this.version_;
  }

  /**
   * Whether anything is unsent or in flight: somebody else's event is then too early to
   * trust.
   */
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

  /** Call on every change to the document. Sending happens after the pause. */
  edit(text: string): void {
    if (!this.path) return;
    this.pending = text;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.push();
    }, this.debounceMs);
  }

  /**
   * Flush everything accumulated and wait for it to arrive: before saving, and before a
   * question to the language server.
   *
   * "Flush" means exactly that. If an edit was already in flight when we were called,
   * what accumulated will leave after it — and both have to be waited for. `flush` used
   * to return at once in that case, and the completion question overtook the text:
   * tsserver received a line it did not have yet and failed on the position check.
   */
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
