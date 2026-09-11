import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { DocState } from '@mosetta/ide-protocol';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import type { DocWire } from '@mosetta/ide-api/client';
import { DocSync } from './sync.js';

export interface Reveal {
  path: string;
  line: number;
  character?: number;
  epoch: number;
}

export interface DocServices {
  say(message: string): void;
  complain(message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
  remembered(root: string): Signal<string | null>;
}

export class Doc {
  readonly open = signal<DocState | null>(null);
  readonly dirty = signal(false);

  readonly history = signal<string[]>([]);

  readonly externalEpoch = signal(0);

  readonly openEpoch = signal(0);

  readonly pendingReveal = signal<Reveal | null>(null);

  readonly diverged = signal<Map<string, 'changed' | 'removed'>>(new Map());

  readonly sync: DocSync;

  readonly path: ReadonlySignal<string | null> = computed(() => this.open.value?.path ?? null);

  private readonly expected = new Set<string>();

  private readonly mergeRequests = new Set<(path: string) => void>();
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly wire: DocWire,
    private readonly services: DocServices,
  ) {
    this.sync = new DocSync(
      wire,
      (message) => services.complain(message),
      () => void this.adoptFromServer(),
    );
    this.listen();
  }

  reveal(path: string, line: number, character?: number): void {
    const epoch = (this.pendingReveal.value?.epoch ?? 0) + 1;
    this.pendingReveal.value = { path, line, character, epoch };
  }

  async openAt(path: string, root: string | null): Promise<void> {
    try {
      const previous = this.open.value;
      if (previous && previous.path !== path) {
        await this.sync.flush();
        void this.wire.close(previous.path);
      }
      const doc = await this.wire.open(path);
      this.sync.attach(doc);
      if (previous?.path !== path) this.openEpoch.value += 1;
      batch(() => {
        this.history.value = [path, ...this.history.value.filter((item) => item !== path)].slice(0, 20);
        this.open.value = doc;
        this.dirty.value = doc.dirty;
      });
      if (root) this.services.remembered(root).value = path;
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  async close(root: string | null): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      await this.sync.flush();
    } finally {
      this.sync.detach();
      void this.wire.close(file.path);
      if (root) this.services.remembered(root).value = null;
      batch(() => {
        this.open.value = null;
        this.dirty.value = false;
      });
    }
  }

  edit(text: string): void {
    this.dirty.value = true;
    this.sync.edit(text);
  }

  private async adoptFromServer(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      const doc = await this.wire.state(file.path);
      if (this.open.value?.path !== file.path) return;
      this.sync.attach(doc);
      batch(() => {
        this.open.value = doc;
        this.dirty.value = doc.dirty;
        this.externalEpoch.value += 1;
      });
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  onMergeRequested(handler: (path: string) => void): () => void {
    this.mergeRequests.add(handler);
    return () => {
      this.mergeRequests.delete(handler);
    };
  }

  requestMerge(path: string): void {
    for (const handler of this.mergeRequests) handler(path);
  }

  async save(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      await this.sync.flush();
      const saved = await this.wire.save(file.path);
      this.forgetDiverged(file.path);
      this.sync.attach(saved);
      batch(() => {
        this.open.value = saved;
        this.dirty.value = false;
      });
    } catch (err) {
      if (codeOf(err) === RpcErrorCode.RevisionConflict) {
        this.requestMerge(file.path);
        return;
      }
      this.services.complain(describe(err));
    }
  }

  async reload(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      const doc = await this.wire.reload(file.path);
      this.forgetDiverged(file.path);
      this.sync.attach(doc);
      batch(() => {
        this.open.value = doc;
        this.dirty.value = false;
        this.externalEpoch.value += 1;
      });
      this.services.say(this.services.t('file.reloaded', { path: doc.path }));
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  expectExternal(path: string): void {
    this.expected.add(path);
  }

  forgetDiverged(path: string): void {
    if (!this.diverged.value.has(path)) return;
    const next = new Map(this.diverged.value);
    next.delete(path);
    this.diverged.value = next;
  }

  async attached(root: string): Promise<void> {
    const path = this.open.peek()?.path ?? this.services.remembered(root).peek();
    if (!path) return;
    const alive = await this.wire.state(path).catch(() => null);
    if (alive) await this.openAt(path, root);
    else this.services.remembered(root).value = null;
  }

  reset(): void {
    this.sync.detach();
    batch(() => {
      this.open.value = null;
      this.dirty.value = false;
      this.history.value = [];
      this.diverged.value = new Map();
      this.pendingReveal.value = null;
    });
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  private listen(): void {
    this.offs.push(
      this.wire.onChanged((event) => {
        if (this.open.value?.path !== event.path) return;
        this.dirty.value = event.dirty;
        if (event.version !== this.sync.version && !this.sync.busy) void this.adoptFromServer();
      }),
      this.wire.onExternal((event) => {
        const asked = this.expected.delete(event.path);
        this.forgetDiverged(event.path);
        if (this.open.value?.path !== event.path) return;
        void this.wire
          .state(event.path)
          .then((doc) => {
            this.sync.attach(doc);
            batch(() => {
              this.open.value = doc;
              this.dirty.value = doc.dirty;
              this.externalEpoch.value += 1;
            });
            if (!asked) this.services.say(this.services.t('file.external', { path: event.path }));
          })
          .catch((err) => this.services.complain(describe(err)));
      }),
      this.wire.onDiverged((event) => {
        const next = new Map(this.diverged.value);
        next.set(event.path, event.reason);
        this.diverged.value = next;
      }),
      this.wire.onMoved((event) => {
        this.history.value = this.history.value.map((path) => (path === event.from ? event.path : path));
        if (this.open.value?.path !== event.from) return;
        void this.wire
          .state(event.path)
          .then((doc) => {
            this.sync.attach(doc);
            batch(() => {
              this.open.value = doc;
              this.dirty.value = doc.dirty;
            });
          })
          .catch((err) => this.services.complain(describe(err)));
      }),
      this.wire.onRemoved((event) => {
        if (this.open.value?.path !== event.path) return;
        const back = this.history.value.find((path) => path !== event.path);
        batch(() => {
          this.history.value = this.history.value.filter((path) => path !== event.path);
          this.open.value = null;
          this.dirty.value = false;
        });
        this.sync.detach();
        this.services.complain(this.services.t('file.gone', { path: event.path }));
        if (back) void this.openAt(back, null);
      }),
    );
  }
}

function codeOf(err: unknown): number | undefined {
  return err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
