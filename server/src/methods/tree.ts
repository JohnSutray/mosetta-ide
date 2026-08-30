import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export class TreeMethods {
  readonly list: Handler<'tree.list'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') {
      throw RpcError.invalidParams('нужен path: string');
    }
    const ram = ctx.session.requireWorkspace().services.ram;
    const cached = ram.listSync(params.path);
    return cached ?? ram.list(params.path);
  };

  readonly stats: Handler<'tree.stats'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.ram.stats();
}

export const treeMethods = new TreeMethods();
