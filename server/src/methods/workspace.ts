import type { WorkspaceInfo } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';
import { suggestDirectories } from '../env/browse.js';

export const workspaceOpen: Handler<'workspace.open'> = async (params, ctx) => {
  if (!params || typeof params.root !== 'string') {
    throw RpcError.invalidParams('нужен root: string');
  }
  const ws = await ctx.registry.open(params.root);
  ctx.session.attachTo(ws);
  ctx.registry.announce();
  return ws.info();
};

export const workspaceAttach: Handler<'workspace.attach'> = (params, ctx) => {
  if (!params || typeof params.id !== 'string') {
    throw RpcError.invalidParams('нужен id: string');
  }
  const ws = ctx.registry.require(params.id);
  ctx.session.attachTo(ws);
  ctx.registry.announce();
  return ws.info();
};

export const workspaceDetach: Handler<'workspace.detach'> = (_params, ctx) => {
  ctx.session.detach();
  ctx.registry.announce();
  return null;
};

export const workspaceList: Handler<'workspace.list'> = (_params, ctx) =>
  ctx.registry.list();

export const workspaceCurrent: Handler<'workspace.current'> = (
  _params,
  ctx,
): WorkspaceInfo | null => ctx.session.workspace?.info() ?? null;

export const workspaceClose: Handler<'workspace.close'> = async (params, ctx) => {
  if (!params || typeof params.id !== 'string') {
    throw RpcError.invalidParams('нужен id: string');
  }
  const ws = ctx.registry.require(params.id);
  ws.broadcast('workspace.closed', { id: ws.id });
  await ctx.registry.close(params.id);
  return null;
};

export const workspaceBrowse: Handler<'workspace.browse'> = (params) => {
  if (!params || typeof params.prefix !== 'string') {
    throw RpcError.invalidParams('нужен prefix: string');
  }
  return suggestDirectories(params.prefix);
};
