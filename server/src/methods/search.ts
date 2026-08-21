import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const indexSearch: Handler<'index.search'> = (params, ctx) => {
  if (!params || typeof params.query !== 'string') {
    throw RpcError.invalidParams('нужен query: string');
  }
  const services = ctx.session.requireWorkspace().services;
  return services.index.search(params.query, params.limit, params.kinds);
};

export const indexStats: Handler<'index.stats'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.index.stats();
