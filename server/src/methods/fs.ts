import type { Handler } from '../rpc/context.js';
import { revealInFileManager } from '../env/reveal.js';
import { RpcError } from '../errors.js';

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}

export class FsMethods {
  readonly list: Handler<'fs.list'> = (params, ctx) =>
    ctx.session.requireWorkspace().services.os.list(pathOf(params));

  readonly read: Handler<'fs.read'> = async (params, ctx) => {
    const file = await ctx.session.requireWorkspace().services.os.read(pathOf(params));
    return file;
  };

  readonly write: Handler<'fs.write'> = (params, ctx) => {
    if (typeof params?.text !== 'string') throw RpcError.invalidParams('нужен text: string');
    return ctx.session
      .requireWorkspace()
      .services.os.write(pathOf(params), params.text, params.expectedRevision);
  };

  readonly create: Handler<'fs.create'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    const kind = params.kind === 'dir' ? 'dir' : 'file';
    return ctx.session.requireWorkspace().services.os.create(params.path, kind);
  };

  readonly move: Handler<'fs.move'> = (params, ctx) => {
    if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
      throw RpcError.invalidParams('нужны from и to');
    }
    return ctx.session.requireWorkspace().services.os.move(params.from, params.to);
  };

  readonly copy: Handler<'fs.copy'> = (params, ctx) => {
    if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
      throw RpcError.invalidParams('нужны from и to');
    }
    return ctx.session.requireWorkspace().services.os.copy(params.from, params.to);
  };

  readonly remove: Handler<'fs.remove'> = async (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    await ctx.session.requireWorkspace().services.os.remove(params.path);
    return null;
  };

  readonly writeBytes: Handler<'fs.writeBytes'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string' || typeof params.base64 !== 'string') {
      throw RpcError.invalidParams('нужны path и base64');
    }
    return ctx.session.requireWorkspace().services.os.writeBytes(params.path, params.base64);
  };

  readonly reveal: Handler<'fs.reveal'> = async (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    const ws = ctx.session.requireWorkspace();
    await revealInFileManager(ws.resolve(params.path));
    return null;
  };

  readonly absolute: Handler<'fs.absolute'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    return { path: ctx.session.requireWorkspace().resolve(params.path) };
  };
}

export const fsMethods = new FsMethods();
