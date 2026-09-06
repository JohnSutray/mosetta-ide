import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import {
  RpcErrorCode,
  type ApiMethod,
  type EventName,
  type EventPayload,
  type RpcId,
  type ServerFrame,
} from '@ide/protocol';
import { RpcError } from '../errors.js';
import { journal } from '../log.js';
import { handlers } from '../methods/index.js';
import type { PluginHost } from '../plugins/host.js';
import type { ConfigStore } from '../config/store.js';
import type { WorkspaceRegistry } from '../workspace/registry.js';
import type { Workspace } from '../workspace/workspace.js';
import type { RpcContext, SessionContext } from './context.js';

const log = journal.logger('session');

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
  ) {
    socket.on('message', (data) => void this.onMessage(String(data)));
    socket.on('close', () => this.dispose());
    socket.on('error', (err) => log.warn(`сокет ${this.id}: ${String(err)}`));

    this.unsubscribe.push(this.registry.onChange((list) => this.notify('workspace.list', list)));
    this.unsubscribe.push(journal.onLog((line) => this.notify('log', line)));
    this.unsubscribe.push(this.config.onChange((bundle) => this.notify('config.changed', bundle)));

    this.notify('workspace.list', this.registry.list());
    this.notify('config.changed', this.config.current);
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
  }

  detach(): void {
    if (!this.current) return;
    this.releaseCurrent();
    this.notify('workspace.attached', null);
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
      this.sendError(null, { code: RpcErrorCode.ParseError, message: 'Не JSON' });
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
        message: 'Нужны числовой id и строковый method',
      });
      return;
    }

    const handler = handlers[method as ApiMethod] as
      | ((p: unknown, ctx: RpcContext) => unknown)
      | undefined;
    if (!handler) {
      this.sendError(id, {
        code: RpcErrorCode.MethodNotFound,
        message: `Нет метода ${method}`,
      });
      return;
    }

    const ctx: RpcContext = {
      session: this,
      registry: this.registry,
      config: this.config,
      plugins: this.plugins,
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
