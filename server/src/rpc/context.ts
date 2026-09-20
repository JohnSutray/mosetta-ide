import type { ApiMethod, EventName, EventPayload, Params, Result } from '@mosetta/ide-protocol';
import type { ProcessMemory } from '../env/memory.js';
import type { PluginHost } from '../plugins/host.js';
import type { ConfigStore } from '../config/store.js';
import type { WorkspaceRegistry } from '../workspace/registry.js';
import type { Workspace } from '../workspace/workspace.js';

/**
 * What a method knows about whoever called it. Note what is NOT here: a parameter
 * carrying a project id. Project methods take the workspace from the session — which is
 * what "switching projects changes the place we read from" means.
 */
export interface SessionContext {
  readonly id: string;
  readonly workspace: Workspace | null;
  /** The workspace, or a comprehensible error — no need to check by hand. */
  requireWorkspace(): Workspace;
  attachTo(workspace: Workspace): void;
  detach(): void;
  notify<E extends EventName>(event: E, payload: EventPayload<E>): void;
}

export interface RpcContext {
  session: SessionContext;
  registry: WorkspaceRegistry;
  config: ConfigStore;
  /** The plugins' home: the built halves and their methods. */
  plugins: PluginHost;
  /** How to measure ourselves and our descendants. */
  memory: Pick<ProcessMemory, 'treeMb' | 'kidsMb'>;
  startedAt: number;
}

export type Handler<M extends ApiMethod> = (
  params: Params<M>,
  ctx: RpcContext,
) => Result<M> | Promise<Result<M>>;

export type HandlerTable = { [M in ApiMethod]: Handler<M> };
