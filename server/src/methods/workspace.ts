import type { WorkspaceInfo } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';
import { browse } from '../env/browse.js';
import { recent } from '../env/recent.js';
import { shells } from '../env/shell.js';
import { tools } from '../env/tools.js';
import { visitsStore } from '../env/visits.js';

export class WorkspaceMethods {
  readonly open: Handler<'workspace.open'> = async (params, ctx) => {
    if (!params || typeof params.root !== 'string') {
      throw RpcError.invalidParams('нужен root: string');
    }
    const ws = await ctx.registry.open(params.root);
    ctx.session.attachTo(ws);
    ctx.registry.announce();
    await recent.remember(ctx.stateDir, ws.root, ws.name);
    return ws.info();
  };

  readonly attach: Handler<'workspace.attach'> = (params, ctx) => {
    if (!params || typeof params.id !== 'string') {
      throw RpcError.invalidParams('нужен id: string');
    }
    const ws = ctx.registry.require(params.id);
    ctx.session.attachTo(ws);
    ctx.registry.announce();
    return ws.info();
  };

  readonly detach: Handler<'workspace.detach'> = (_params, ctx) => {
    ctx.session.detach();
    ctx.registry.announce();
    return null;
  };

  readonly list: Handler<'workspace.list'> = (_params, ctx) =>
    ctx.registry.list();

  readonly current: Handler<'workspace.current'> = (
    _params,
    ctx,
  ): WorkspaceInfo | null => ctx.session.workspace?.info() ?? null;

  readonly close: Handler<'workspace.close'> = async (params, ctx) => {
    if (!params || typeof params.id !== 'string') {
      throw RpcError.invalidParams('нужен id: string');
    }
    const ws = ctx.registry.require(params.id);
    ws.broadcast('workspace.closed', { id: ws.id });
    await ctx.registry.close(params.id);
    return null;
  };

  readonly browse: Handler<'workspace.browse'> = (params) => {
    if (!params || typeof params.prefix !== 'string') {
      throw RpcError.invalidParams('нужен prefix: string');
    }
    const depth = Math.min(2, Math.max(1, params.depth ?? 1));
    const limit =
      typeof params.limit === 'number' && params.limit > 0 ? params.limit : Number.POSITIVE_INFINITY;
    return browse.suggestDirectories(params.prefix, limit, depth);
  };

  readonly roots: Handler<'workspace.roots'> = () => browse.browseRoots();

  readonly recent: Handler<'workspace.recent'> = (_params, ctx) =>
    recent.listRecent(ctx.stateDir);
}

export const workspaceMethods = new WorkspaceMethods();

export class EnvMethods {
  readonly shells: Handler<'env.shells'> = (_params, ctx) =>
    shells.detectShells(shells.loginShell(ctx.config.settings.terminal).file);

  readonly packageManagers: Handler<'env.packageManagers'> = (_params, ctx) => {
    const ws = ctx.session.requireWorkspace();
    return tools.detectPackageManagers(
      ws.services.suggestedManager(),
      ctx.config.settings.tools.packageManager,
      ws.root,
    );
  };
}

export const envMethods = new EnvMethods();

export class VisitsMethods {
  readonly get: Handler<'visits.get'> = (_params, ctx) => {
    const ws = ctx.session.requireWorkspace();
    return visitsStore.loadVisits(ctx.stateDir, ws.root);
  };

  readonly set: Handler<'visits.set'> = async (params, ctx) => {
    if (!params || !Array.isArray(params.visits)) {
      throw RpcError.invalidParams('нужен visits: Visit[]');
    }
    const ws = ctx.session.requireWorkspace();
    const visits = params.visits.slice(-visitsStore.VISIT_LIMIT);
    await visitsStore.saveVisits(ctx.stateDir, ws.root, visits);
    return { saved: visits.length };
  };
}

export const visitsMethods = new VisitsMethods();
