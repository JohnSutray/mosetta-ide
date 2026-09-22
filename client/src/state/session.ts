import { signal } from '@preact/signals';
import type { LogLine, WorkspaceInfo } from '@mosetta/ide-protocol';
import { RpcClient, RpcFailure } from '../rpc/client.js';
import type { Notifications } from './notifications.js';
import type { Config } from './config.js';
import type { I18n } from '../i18n/index.js';

/**
 * As much of the socket as the plugin loader needs.
 *
 * Under its own type, so that it arrives through the constructor and can be substituted
 * in a test: unpacking the `plugins.event` envelope is the one place where the core
 * decides whose event this is, and getting it wrong there means handing over somebody
 * else's.
 */
export type RpcLike = Pick<RpcClient, 'call' | 'on'>;

export class Session {
  readonly connected: RpcClient['connected'];
  /** What the daemon says about itself on the heartbeat: its memory. */
  readonly daemon: RpcClient['daemon'];
  readonly workspaces = signal<WorkspaceInfo[]>([]);
  readonly current = signal<WorkspaceInfo | null>(null);
  /**
   * The project this socket is ATTACHED to.
   *
   * `current` is "which project the tab has": it is set before the server has confirmed
   * the attachment, and it survives the connection dropping. A plugin that asks the
   * server based on `current` gets "the session is not attached" during that window. So
   * what goes outwards is this signal: it rises after the attachment and goes out with
   * the socket.
   */
  readonly attached = signal<WorkspaceInfo | null>(null);
  readonly logs = signal<LogLine[]>([]);

  /**
   * Who is to reset when the project changes. Everything project-scoped on the server
   * is a workspace resource, and it is the same on the client: on a change, state is
   * not "refreshed" but reset whole.
   */
  private readonly parts: Array<{ reset(): void }> = [];
  private readonly extraResets: Array<() => void> = [];

  /** We restore from the address exactly once: after that the tab belongs to the user. */
  private restored = false;
  private everConnected = false;
  /**
   * Who to tell that the config has arrived: the core lays its layers out into the
   * sections' keys. A callback rather than an import: the session knows nothing about
   * the registry and has no business knowing.
   */
  private onConfig: (() => void) | null = null;

  constructor(
    private readonly rpc: RpcClient,
    /** The tab's config: the server sends `config.changed`, we store it. */
    private readonly config: Config,
    private readonly notes: Pick<Notifications, 'say' | 'complain'>,
    private readonly i18n: Pick<I18n, 't'>,
  ) {
    this.connected = rpc.connected;
    this.daemon = rpc.daemon;
    this.listen();
  }

  /** Who will lay the arriving config out. Called once, while assembling. */
  /**
   * Whether the open project lives in the page's address. A tab of its own keeps it
   * there, so a reload comes back to the same project; an IDE embedded in somebody
   * else's page has no business rewriting their address.
   */
  private inUrl = true;

  keepInUrl(on: boolean): void {
    this.inUrl = on;
  }

  private remember(root: string): void {
    if (this.inUrl) rememberInUrl(root);
  }

  onConfigChanged(handler: () => void): void {
    this.onConfig = handler;
  }

  /** Who resets along with the project. Called once, while assembling. */
  owns(...parts: Array<{ reset(): void }>): void {
    this.parts.push(...parts);
  }

  /** The same, but for a single line of state: a panel, a flag, a counter. */
  onReset(handler: () => void): void {
    this.extraResets.push(handler);
  }

  async openProject(root: string): Promise<void> {
    try {
      const info = await this.rpc.call('workspace.open', { root });
      this.reset();
      this.current.value = info;
      this.remember(info.root);
      await this.afterAttach();
    } catch (err) {
      this.notes.complain(describe(err));
    }
  }

  async switchProject(id: string): Promise<void> {
    if (this.current.value?.id === id) return;
    try {
      const info = await this.rpc.call('workspace.attach', { id });
      this.reset();
      this.current.value = info;
      this.remember(info.root);
      await this.afterAttach();
    } catch (err) {
      this.notes.complain(describe(err));
    }
  }

  private reset(): void {
    this.attached.value = null;
    for (const part of this.parts) part.reset();
    for (const extra of this.extraResets) extra();
  }

  /**
   * What we do right after attaching to a project.
   *
   * Assembled HERE rather than spread across three classes: the order matters, and it
   * has to be visible in one piece.
   */
  private async afterAttach(): Promise<void> {
    this.attached.value = this.current.value;
  }

  /**
   * The connection came up AFRESH.
   *
   * A socket can come back by itself; a session on the server cannot — it lives exactly
   * as long as the connection does. A fresh server-side session is attached to no
   * project, and without this step the result was the worst of pictures: the connection
   * is there, the light is on, and yet no events arrive and the file will not save.
   */
  private async resume(): Promise<void> {
    const ws = this.current.peek();
    if (!ws) return;
    try {
      const info = await this.rpc.call('workspace.open', { root: ws.root });
      this.current.value = info;
      await this.afterAttach();
      this.notes.say(this.i18n.t('session.resumed'));
    } catch (err) {
      this.notes.complain(describe(err));
    }
  }

  private restoreFromUrl(list: WorkspaceInfo[]): void {
    if (this.restored) return;
    this.restored = true;
    const wanted = this.inUrl ? projectFromUrl() : null;
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

    this.rpc.on('config.changed', (bundle) => {
      this.config.apply(bundle);
      this.onConfig?.();
    });

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
      if (info) this.remember(info.root);
    });

    this.rpc.on('workspace.closed', ({ id }) => {
      if (this.current.value?.id !== id) return;
      this.reset();
      this.current.value = null;
    });

    this.rpc.on('log', (line) => {
      this.logs.value = [...this.logs.value.slice(-499), line];
    });
  }
}

/**
 * The last project lives in the tab's ADDRESS.
 *
 * A page reload, the browser restoring a session, a bookmark pointing at a particular
 * project — all of that works by itself, because an address outlives a tab. The history
 * on the server answers a different question, "what have I opened at all"; here there
 * is exactly one thing: "what is open IN THIS TAB".
 *
 * Which is also why this is not localStorage: two tabs holding different projects must
 * not fight over one cell.
 */
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
