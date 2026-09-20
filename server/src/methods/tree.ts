import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export class TreeMethods {
  /**
   * The memory layer, the tree. Disk is not touched here: the project was walked
   * greedily when it opened, and `tree.list` is a read from a map.
   *
   * There is one exception and it is deliberate: directories from `fs.noScan`
   * (node_modules) were not walked greedily, so the first expansion reads them from
   * disk and puts them into memory. After that they are instant too.
   */

  readonly list: Handler<'tree.list'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') {
      throw RpcError.invalidParams('path: string required');
    }
    const ram = ctx.session.requireWorkspace().services.ram;
    const cached = ram.listSync(params.path);
    return cached ?? ram.list(params.path);
  };

  readonly stats: Handler<'tree.stats'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.ram.stats();
}

/** One per server: the handlers are stateless, everything arrives in the context. */
export const treeMethods = new TreeMethods();
