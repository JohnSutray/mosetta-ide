import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export class MergeMethods {
  readonly state: Handler<'merge.state'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.merge.state();

  readonly resolve: Handler<'merge.resolve'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    if (params.text !== null && typeof params.text !== 'string') {
      throw RpcError.invalidParams('нужен text: string | null');
    }
    return ctx.session.requireWorkspace().services.merge.resolve(params.path, params.text);
  };

  readonly cancel: Handler<'merge.cancel'> = async (_params, ctx) => {
    await ctx.session.requireWorkspace().services.merge.cancel();
    return null;
  };
}

export const mergeMethods = new MergeMethods();
