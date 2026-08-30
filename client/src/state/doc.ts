import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Diagnostic, DocState } from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcFailure, type RpcClient } from '../rpc/client.js';
import { complain, say } from './notifications.js';
import { forget, keep, recall } from './persist.js';
import { DocSync } from './doc-sync.js';
import { t } from '../i18n/index.js';
import type { Lsp } from './lsp.js';
import type { Session } from './session.js';

export class Doc {
  readonly open = signal<DocState | null>(null);
  readonly dirty = signal(false);

  readonly history = signal<string[]>([]);

  readonly externalEpoch = signal(0);

  readonly pendingReveal = signal<{
    path: string;
    line: number;
    character?: number;
    epoch: number;
  } | null>(null);

  readonly diverged = signal<Map<string, 'changed' | 'removed'>>(new Map());

  readonly sync: DocSync;

  readonly path: ReadonlySignal<string | null> = computed(() => this.open.value?.path ?? null);

  readonly diagnostics: ReadonlySignal<Diagnostic[]> = computed(() =>
    this.lsp.of(this.path.value),
  );

  readonly title: ReadonlySignal<string> = computed(() => {
    const ws = this.session.current.value;
    const file = this.open.value;
    if (!ws) return 'web-ide';
    return file ? `${file.path} — ${ws.name}` : ws.name;
  });

  private readonly expected = new Set<string>();

  private onConflict: ((path: string) => void) | null = null;

  constructor(
    private readonly rpc: RpcClient,
    private readonly session: Session,
    private readonly lsp: Lsp,
  ) {
    this.sync = new DocSync(rpc, (message) => complain(message));
    this.listen();
  }

  reveal(path: string, line: number, character?: number): void {
    const epoch = (this.pendingReveal.value?.epoch ?? 0) + 1;
    this.pendingReveal.value = { path, line, character, epoch };
  }

  async openAt(path: string): Promise<void> {
    try {
      const previous = this.open.value;
      if (previous && previous.path !== path) {
        await this.sync.flush();
        void this.rpc.call('doc.close', { path: previous.path });
      }
      const doc = await this.rpc.call('doc.open', { path });
      this.sync.attach(doc);
      batch(() => {
        this.history.value = [path, ...this.history.value.filter((item) => item !== path)].slice(
          0,
          20,
        );
        this.open.value = doc;
        this.dirty.value = doc.dirty;
      });
      this.remember(path);
      const known = await this.rpc.call('lsp.diagnostics', { path }).catch(() => null);
      if (known) this.lsp.set(known.path, known.diagnostics);
    } catch (err) {
      complain(describe(err));
    }
  }

  async close(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      await this.sync.flush();
    } finally {
      this.sync.detach();
      void this.rpc.call('doc.close', { path: file.path });
      this.remember(null);
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

  replaceText(text: string): void {
    const file = this.open.value;
    if (!file || file.text === text) return;
    batch(() => {
      this.open.value = { ...file, text };
      this.externalEpoch.value += 1;
    });
    this.edit(text);
  }

  whenSaveConflicts(handler: (path: string) => void): void {
    this.onConflict = handler;
  }

  async save(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      await this.sync.flush();
      const saved = await this.rpc.call('doc.save', { path: file.path });
      this.forgetDiverged(file.path);
      this.sync.attach(saved);
      batch(() => {
        this.open.value = saved;
        this.dirty.value = false;
      });
    } catch (err) {
      if (err instanceof RpcFailure && err.code === RpcErrorCode.RevisionConflict) {
        this.onConflict?.(file.path);
        return;
      }
      complain(describe(err));
    }
  }

  async reload(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      const doc = await this.rpc.call('doc.reload', { path: file.path });
      this.forgetDiverged(file.path);
      this.sync.attach(doc);
      batch(() => {
        this.open.value = doc;
        this.dirty.value = false;
        this.externalEpoch.value += 1;
      });
      say(t('file.reloaded', { path: doc.path }));
    } catch (err) {
      complain(describe(err));
    }
  }

  expectExternal(path: string): void {
    this.expected.add(path);
  }

  divergedFrom(path: string | null): 'changed' | 'removed' | null {
    return path ? (this.diverged.value.get(path) ?? null) : null;
  }

  forgetDiverged(path: string): void {
    if (!this.diverged.value.has(path)) return;
    const next = new Map(this.diverged.value);
    next.delete(path);
    this.diverged.value = next;
  }

  async reopen(): Promise<void> {
    const ws = this.session.current.peek();
    if (!ws || this.open.peek()) return;
    const path = recall<string | null>(fileKey(ws.root), null);
    if (!path) return;
    const alive = await this.rpc.call('doc.state', { path }).catch(() => null);
    if (alive) await this.openAt(path);
    else forget(fileKey(ws.root), 'tab');
  }

  reset(): void {
    this.sync.detach();
    batch(() => {
      this.open.value = null;
      this.dirty.value = false;
      this.history.value = [];
      this.diverged.value = new Map();
    });
  }

  private remember(path: string | null): void {
    const ws = this.session.current.peek();
    if (!ws) return;
    if (path) keep(fileKey(ws.root), path, 'tab');
    else forget(fileKey(ws.root), 'tab');
  }

  private listen(): void {
    this.rpc.on('doc.changed', (event) => {
      if (this.open.value?.path !== event.path) return;
      this.dirty.value = event.dirty;
    });

    this.rpc.on('doc.external', (event) => {
      const asked = this.expected.delete(event.path);
      this.forgetDiverged(event.path);
      if (this.open.value?.path !== event.path) return;
      void this.rpc
        .call('doc.state', { path: event.path })
        .then((doc) => {
          this.sync.attach(doc);
          batch(() => {
            this.open.value = doc;
            this.dirty.value = doc.dirty;
            this.externalEpoch.value += 1;
          });
          if (!asked) say(t('file.external', { path: event.path }));
        })
        .catch((err) => complain(describe(err)));
    });

    this.rpc.on('doc.diverged', (event) => {
      const next = new Map(this.diverged.value);
      next.set(event.path, event.reason);
      this.diverged.value = next;
    });

    this.rpc.on('doc.moved', (event) => {
      this.history.value = this.history.value.map((path) =>
        path === event.from ? event.path : path,
      );
      if (this.open.value?.path !== event.from) return;
      void this.rpc
        .call('doc.state', { path: event.path })
        .then((doc) => {
          this.sync.attach(doc);
          batch(() => {
            this.open.value = doc;
            this.dirty.value = doc.dirty;
          });
        })
        .catch((err) => complain(describe(err)));
    });

    this.rpc.on('doc.removed', (event) => {
      if (this.open.value?.path !== event.path) return;
      const back = this.history.value.find((path) => path !== event.path);
      batch(() => {
        this.history.value = this.history.value.filter((path) => path !== event.path);
        this.open.value = null;
        this.dirty.value = false;
      });
      this.sync.detach();
      complain(t('file.gone', { path: event.path }));
      if (back) void this.openAt(back);
    });
  }
}

function fileKey(root: string): string {
  return `file:${root}`;
}

function describe(err: unknown): string {
  if (err instanceof RpcFailure) return err.message;
  return err instanceof Error ? err.message : String(err);
}
