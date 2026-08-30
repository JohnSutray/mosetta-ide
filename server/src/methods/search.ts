import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export class SearchMethods {
  readonly search: Handler<'index.search'> = (params, ctx) => {
    if (!params || typeof params.query !== 'string') {
      throw RpcError.invalidParams('нужен query: string');
    }
    const services = ctx.session.requireWorkspace().services;
    return services.index.search(params.query, params.limit, params.kinds);
  };

  readonly stats: Handler<'index.stats'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.index.stats();
}

export const searchMethods = new SearchMethods();
