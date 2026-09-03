import { signal } from '@preact/signals';
import type { LogLine, WorkspaceInfo } from '@ide/protocol';
import { RpcClient, RpcFailure } from '../rpc/client.js';
import { complain } from './notifications.js';
import { config } from './config.js';
import { FileTree } from './file-tree.js';
import { Lsp } from './lsp.js';
import { Doc } from './doc.js';
import { say } from './notifications.js';
import { i18n } from '../i18n/index.js';

export type RpcLike = Pick<RpcClient, 'call' | 'on'>;

export const rpc = new RpcClient();

export class Session {
  readonly connected = rpc.connected;
  readonly workspaces = signal<WorkspaceInfo[]>([]);
  readonly current = signal<WorkspaceInfo | null>(null);
  readonly attached = signal<WorkspaceInfo | null>(null);
  readonly logs = signal<LogLine[]>([]);

  private readonly parts: Array<{ reset(): void }> = [];
  private readonly extraResets: Array<() => void> = [];

  private restored = false;
  private everConnected = false;

  constructor(private readonly rpc: RpcClient) {
    this.listen();
  }

  owns(...parts: Array<{ reset(): void }>): void {
    this.parts.push(...parts);
  }

  onReset(handler: () => void): void {
    this.extraResets.push(handler);
  }

  async openProject(root: string): Promise<void> {
    try {
      const info = await this.rpc.call('workspace.open', { root });
      this.reset();
      this.current.value = info;
      rememberInUrl(info.root);
      await this.afterAttach();
    } catch (err) {
      complain(describe(err));
    }
  }

  async switchProject(id: string): Promise<void> {
    if (this.current.value?.id === id) return;
    try {
      const info = await this.rpc.call('workspace.attach', { id });
      this.reset();
      this.current.value = info;
      rememberInUrl(info.root);
      await this.afterAttach();
    } catch (err) {
      complain(describe(err));
    }
  }

  private reset(): void {
    this.attached.value = null;
    for (const part of this.parts) part.reset();
    for (const extra of this.extraResets) extra();
  }

  private async afterAttach(): Promise<void> {
    this.attached.value = this.current.value;
    await fileTree.load('');
    lsp.statuses.value = await this.rpc.call('lsp.status', null);
    for (const file of await this.rpc.call('lsp.problems', null).catch(() => [])) {
      lsp.set(file.path, file.diagnostics);
    }
    await doc.reopen();
  }

  private async resume(): Promise<void> {
    const ws = this.current.peek();
    if (!ws) return;
    const path = doc.open.peek()?.path ?? null;
    try {
      const info = await this.rpc.call('workspace.open', { root: ws.root });
      this.current.value = info;
      await this.afterAttach();
      if (path) await doc.openAt(path);
      say(i18n.t('session.resumed'));
    } catch (err) {
      complain(describe(err));
    }
  }

  private restoreFromUrl(list: WorkspaceInfo[]): void {
    if (this.restored) return;
    this.restored = true;
    const wanted = projectFromUrl();
    if (!wanted || this.current.value) return;
    const alive = list.find((ws) => ws.root === wanted);
    void (alive ? this.switchProject(alive.id) : this.openProject(wanted));
  }

  private listen(): void {
    this.connected.subscribe((now) => {
      if (!now) this.attached.value = null;
      if (!now) return;
      if (this.everConnected) void this.resume();
      this.everConnected = true;
    });

    this.rpc.on('config.changed', (bundle) => config.apply(bundle));

    this.rpc.on('workspace.list', (list) => {
      this.workspaces.value = list;
      const mine = this.current.value;
      if (mine) this.current.value = list.find((w) => w.id === mine.id) ?? mine;
      this.restoreFromUrl(list);
    });

    this.rpc.on('workspace.attached', (info) => {
      if (info?.id !== this.current.value?.id) this.reset();
      this.current.value = info;
      this.attached.value = info;
      if (info) rememberInUrl(info.root);
    });

    this.rpc.on('workspace.closed', ({ id }) => {
      if (this.current.value?.id !== id) return;
      this.reset();
      this.current.value = null;
    });

    this.rpc.on('tree.changed', (event) => fileTree.refresh(event.path));

    this.rpc.on('lsp.diagnostics', (event) => lsp.set(event.path, event.diagnostics));
    this.rpc.on('lsp.status', (status) => lsp.setStatus(status));

    this.rpc.on('log', (line) => {
      this.logs.value = [...this.logs.value.slice(-499), line];
    });
  }
}

const WS_PARAM = 'ws';

function projectFromUrl(): string | null {
  if (typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get(WS_PARAM);
}

function rememberInUrl(root: string): void {
  if (typeof location === 'undefined') return;
  const url = new URL(location.href);
  if (url.searchParams.get(WS_PARAM) === root) return;
  url.searchParams.set(WS_PARAM, root);
  history.replaceState(null, '', url);
}

function describe(err: unknown): string {
  if (err instanceof RpcFailure) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export const session = new Session(rpc);
export const fileTree = new FileTree(rpc);
export const lsp = new Lsp();
export const doc = new Doc(rpc, session, lsp);

session.owns(fileTree, doc, lsp);
