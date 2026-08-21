import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const fsList: Handler<'fs.list'> = (params, ctx) =>
  ctx.session.requireWorkspace().services.os.list(pathOf(params));

export const fsRead: Handler<'fs.read'> = async (params, ctx) => {
  const file = await ctx.session.requireWorkspace().services.os.read(pathOf(params));
  return file;
};

export const fsWrite: Handler<'fs.write'> = (params, ctx) => {
  if (typeof params?.text !== 'string') throw RpcError.invalidParams('нужен text: string');
  return ctx.session
    .requireWorkspace()
    .services.os.write(pathOf(params), params.text, params.expectedRevision);
};

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}
