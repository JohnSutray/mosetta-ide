import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export class PluginMethods {
  readonly list: Handler<'plugins.list'> = (_params, ctx) => ctx.plugins.list();

  readonly code: Handler<'plugins.code'> = (params, ctx) => {
    if (!params || typeof params.name !== 'string') throw RpcError.invalidParams('нужен name');
    const code = ctx.plugins.clientCode(params.name);
    if (code === null) throw RpcError.invalidParams(`у плагина ${params.name} нет клиента`);
    return { code };
  };

  readonly call: Handler<'plugins.call'> = (params, ctx) => {
    if (!params || typeof params.name !== 'string' || typeof params.method !== 'string') {
      throw RpcError.invalidParams('нужны name и method');
    }
    return ctx.plugins.call(params.name, params.method, params.params, {
      get services() {
        return ctx.session.requireWorkspace().services;
      },
    });
  };
}

export const pluginMethods = new PluginMethods();
