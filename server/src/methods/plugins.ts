import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

/**
 * Plugins over the wire.
 *
 * Three methods and not one more: what is installed, give me the client half's code,
 * call a method. The core stays CLOSED — plugin calls go through their own door rather
 * than being appended to `Api`. Opening `Api` outwards means burying its types: the
 * union stops being known, and the compiler stops catching forgotten implementations.
 */
export class PluginMethods {
  readonly list: Handler<'plugins.list'> = (_params, ctx) => ctx.plugins.list();

  readonly code: Handler<'plugins.code'> = (params, ctx) => {
    if (!params || typeof params.name !== 'string') throw RpcError.invalidParams('name required');
    const code = ctx.plugins.clientCode(params.name);
    if (code === null) throw RpcError.invalidParams(`plugin ${params.name} has no client`);
    return { code };
  };

  readonly call: Handler<'plugins.call'> = (params, ctx) => {
    if (!params || typeof params.name !== 'string' || typeof params.method !== 'string') {
      throw RpcError.invalidParams('name and method required');
    }
    const plugin = params.name;
    return ctx.plugins.call(plugin, params.method, params.params, {
      get project() {
        return ctx.plugins.projectFor(ctx.session.requireWorkspace(), plugin);
      },
      get services() {
        return ctx.session.requireWorkspace().services;
      },
    });
  };
}

/** One per server: the handlers are stateless, everything arrives in the context. */
export const pluginMethods = new PluginMethods();
