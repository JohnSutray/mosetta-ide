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

export const fsCreate: Handler<'fs.create'> = (params, ctx) => {
  if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
  const kind = params.kind === 'dir' ? 'dir' : 'file';
  return ctx.session.requireWorkspace().services.os.create(params.path, kind);
};

export const fsMove: Handler<'fs.move'> = (params, ctx) => {
  if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
    throw RpcError.invalidParams('нужны from и to');
  }
  return ctx.session.requireWorkspace().services.os.move(params.from, params.to);
};

export const fsCopy: Handler<'fs.copy'> = (params, ctx) => {
  if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
    throw RpcError.invalidParams('нужны from и to');
  }
  return ctx.session.requireWorkspace().services.os.copy(params.from, params.to);
};

export const fsRemove: Handler<'fs.remove'> = async (params, ctx) => {
  if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
  await ctx.session.requireWorkspace().services.os.remove(params.path);
  return null;
};

export const fsWriteBytes: Handler<'fs.writeBytes'> = (params, ctx) => {
  if (!params || typeof params.path !== 'string' || typeof params.base64 !== 'string') {
    throw RpcError.invalidParams('нужны path и base64');
  }
  return ctx.session.requireWorkspace().services.os.writeBytes(params.path, params.base64);
};
