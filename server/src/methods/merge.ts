import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const mergeState: Handler<'merge.state'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.merge.state();

export const mergeResolve: Handler<'merge.resolve'> = (params, ctx) => {
  if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
  if (params.text !== null && typeof params.text !== 'string') {
    throw RpcError.invalidParams('нужен text: string | null');
  }
  return ctx.session.requireWorkspace().services.merge.resolve(params.path, params.text);
};

export const mergeCancel: Handler<'merge.cancel'> = async (_params, ctx) => {
  await ctx.session.requireWorkspace().services.merge.cancel();
  return null;
};
