import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const pluginsList: Handler<'plugins.list'> = (_params, ctx) => ctx.plugins.list();

export const pluginsCode: Handler<'plugins.code'> = (params, ctx) => {
  if (!params || typeof params.name !== 'string') throw RpcError.invalidParams('нужен name');
  const code = ctx.plugins.clientCode(params.name);
  if (code === null) throw RpcError.invalidParams(`у плагина ${params.name} нет клиента`);
  return { code };
};

export const pluginsCall: Handler<'plugins.call'> = (params, ctx) => {
  if (!params || typeof params.name !== 'string' || typeof params.method !== 'string') {
    throw RpcError.invalidParams('нужны name и method');
  }
  return ctx.plugins.call(params.name, params.method, params.params, {
    get services() {
      return ctx.session.requireWorkspace().services;
    },
  });
};
