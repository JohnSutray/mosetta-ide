import type { ApiMethod, EventName, EventPayload, Params, Result } from '@ide/protocol';
import type { ConfigStore } from '../config/store.js';
import type { WorkspaceRegistry } from '../workspace/registry.js';
import type { Workspace } from '../workspace/workspace.js';

export interface SessionContext {
  readonly id: string;
  readonly workspace: Workspace | null;
  requireWorkspace(): Workspace;
  attachTo(workspace: Workspace): void;
  detach(): void;
  notify<E extends EventName>(event: E, payload: EventPayload<E>): void;
}

export interface RpcContext {
  session: SessionContext;
  registry: WorkspaceRegistry;
  config: ConfigStore;
  startedAt: number;
}

export type Handler<M extends ApiMethod> = (
  params: Params<M>,
  ctx: RpcContext,
) => Result<M> | Promise<Result<M>>;

export type HandlerTable = { [M in ApiMethod]: Handler<M> };
