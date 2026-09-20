import { randomUUID } from 'node:crypto';
import { ProcessMemory } from '../env/memory.js';
import type { WebSocket } from 'ws';
import {
  RpcErrorCode,
  type ApiMethod,
  type EventName,
  type EventPayload,
  type RpcId,
  type ServerFrame,
} from '@mosetta/ide-protocol';
import { RpcError } from '../errors.js';
import { journal } from '../log.js';
import { handlers } from '../methods/index.js';
import type { PluginHost } from '../plugins/host.js';
import type { ConfigStore } from '../config/store.js';
import type { WorkspaceRegistry } from '../workspace/registry.js';
import type { Workspace } from '../workspace/workspace.js';
import type { RpcContext, SessionContext } from './context.js';

const log = journal.logger('session');

/**
 * One connection = one browser tab = one open project.
 *
 * A session is everything the server knows about a client, and it does not know much:
 * the socket, and the current workspace. There is no editor state here at all, which is
 * why reloading a tab breaks nothing: it simply attaches again to the same warm
 * workspace.
 */
export class Session implements SessionContext {
  readonly id = randomUUID().slice(0, 8);
  private current: Workspace | null = null;
  private readonly unsubscribe: Array<() => void> = [];

  constructor(
    private readonly socket: WebSocket,
    private readonly registry: WorkspaceRegistry,
    private readonly config: ConfigStore,
    private readonly startedAt: number,
    private readonly plugins: PluginHost,
    /** How to measure ourselves. As an instance: a test slips its own in. */
    private readonly memory: Pick<ProcessMemory, 'treeMb' | 'kidsMb'> = new ProcessMemory(),
  ) {
    socket.on('message', (data) => void this.onMessage(String(data)));
    socket.on('close', () => this.dispose());
    socket.on('error', (err) => log.warn(`socket ${this.id}: ${String(err)}`));

    this.unsubscribe.push(this.registry.onChange((list) => this.notify('workspace.list', list)));
    this.unsubscribe.push(journal.onLog((line) => this.notify('log', line)));
    this.unsubscribe.push(this.config.onChange(() => this.sendConfig()));

    this.notify('workspace.list', this.registry.list());
    this.sendConfig();
  }

  get workspace(): Workspace | null {
    return this.current;
  }

  requireWorkspace(): Workspace {
    if (!this.current) throw RpcError.noWorkspace();
    return this.current;
  }

  attachTo(workspace: Workspace): void {
    if (this.current === workspace) return;
    this.releaseCurrent();
    this.current = workspace;
    workspace.attach(this);
    this.notify('workspace.attached', workspace.info());
    this.sendConfig();
  }

  detach(): void {
    if (!this.current) return;
    this.releaseCurrent();
    this.notify('workspace.attached', null);
    this.sendConfig();
  }

  /**
   * THIS tab's config: the personal layer plus the project's, if a project is open. One
   * and the same setting is legitimately different in two tabs holding different
   * projects — which is why the session broadcasts it rather than the store.
   */
  private sendConfig(): void {
    this.notify('config.changed', this.current?.projectConfig.bundle ?? this.config.current);
  }

  notify<E extends EventName>(event: E, payload: EventPayload<E>): void {
    this.send({ jsonrpc: '2.0', method: event, params: payload } as ServerFrame);
  }

  dispose(): void {
    for (const off of this.unsubscribe.splice(0)) off();
    this.releaseCurrent();
  }

  private releaseCurrent(): void {
    const previous = this.current;
    this.current = null;
    if (!previous) return;
    previous.detach(this);
    this.registry.releaseIfIdle(previous);
    this.registry.announce();
  }

  private async onMessage(raw: string): Promise<void> {
    let frame: unknown;
    try {
      frame = JSON.parse(raw);
    } catch {
      this.sendError(null, { code: RpcErrorCode.ParseError, message: 'Not JSON' });
      return;
    }

    const { id, method, params } = (frame ?? {}) as {
      id?: unknown;
      method?: unknown;
      params?: unknown;
    };

    if (typeof id !== 'number' || typeof method !== 'string') {
      this.sendError(typeof id === 'number' ? id : null, {
        code: RpcErrorCode.InvalidRequest,
        message: 'A numeric id and a string method are required',
      });
      return;
    }

    const handler = handlers[method as ApiMethod] as
      | ((p: unknown, ctx: RpcContext) => unknown)
      | undefined;
    if (!handler) {
      this.sendError(id, {
        code: RpcErrorCode.MethodNotFound,
        message: `No such method: ${method}`,
      });
      return;
    }

    const ctx: RpcContext = {
      session: this,
      registry: this.registry,
      config: this.config,
      plugins: this.plugins,
      memory: this.memory,
      startedAt: this.startedAt,
    };

    try {
      const result = await handler(params ?? null, ctx);
      this.send({ jsonrpc: '2.0', id, result });
    } catch (err) {
      if (err instanceof RpcError) {
        this.sendError(id, err.toBody());
      } else {
        log.error(`${method}: ${journal.describeError(err)}`);
        this.sendError(id, {
          code: RpcErrorCode.Internal,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private sendError(id: RpcId | null, error: { code: number; message: string; data?: unknown }) {
    this.send({ jsonrpc: '2.0', id, error } as ServerFrame);
  }

  private send(frame: ServerFrame): void {
    if (this.socket.readyState !== this.socket.OPEN) return;
    this.socket.send(JSON.stringify(frame));
  }
}
