import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

/**
 * How many bytes of a file we hand to a tab at once. A 16 MB image is no longer "take a
 * look" but "hang the tab": base64 inflates it by half, and all of it travels in one
 * frame over the socket.
 */
const MAX_BYTES = 16 * 1024 * 1024;

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('path: string required');
  }
  return params.path;
}

export class FsMethods {
  /**
   * The OS layer over the wire: disk directly, PAST memory.
   *
   * Needed by tools and tests — "what is actually there". The editor does not use it:
   * it has `doc.*`. A write here honestly reaches the memory layer as a `wrote` event,
   * and if the document was open and clean it is re-read, while if it was dirty the tab
   * hears about the divergence. The layers cannot drift apart.
   */

  readonly list: Handler<'fs.list'> = (params, ctx) =>
    ctx.session.requireWorkspace().services.os.list(pathOf(params));

  readonly read: Handler<'fs.read'> = async (params, ctx) => {
    const file = await ctx.session.requireWorkspace().services.os.read(pathOf(params));
    return file;
  };

  readonly write: Handler<'fs.write'> = (params, ctx) => {
    if (typeof params?.text !== 'string') throw RpcError.invalidParams('text: string required');
    return ctx.session
      .requireWorkspace()
      .services.os.write(pathOf(params), params.text, params.expectedRevision);
  };

  /**
   * Tree operations. There are no "is this allowed" checks here: the path has already
   * been checked for escaping the root, and everything else is known to the OS layer,
   * which says so with a comprehensible error.
   */
  readonly create: Handler<'fs.create'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('path required');
    const kind = params.kind === 'dir' ? 'dir' : 'file';
    return ctx.session.requireWorkspace().services.os.create(params.path, kind);
  };

  readonly move: Handler<'fs.move'> = (params, ctx) => {
    if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
      throw RpcError.invalidParams('from and to required');
    }
    return ctx.session.requireWorkspace().services.os.move(params.from, params.to);
  };

  readonly copy: Handler<'fs.copy'> = (params, ctx) => {
    if (!params || typeof params.from !== 'string' || typeof params.to !== 'string') {
      throw RpcError.invalidParams('from and to required');
    }
    return ctx.session.requireWorkspace().services.os.copy(params.from, params.to);
  };

  readonly remove: Handler<'fs.remove'> = async (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('path required');
    await ctx.session.requireWorkspace().services.os.remove(params.path);
    return null;
  };

  readonly writeBytes: Handler<'fs.writeBytes'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string' || typeof params.base64 !== 'string') {
      throw RpcError.invalidParams('path and base64 required');
    }
    return ctx.session.requireWorkspace().services.os.writeBytes(params.path, params.base64);
  };

  /**
   * A file's bytes. The caller sets the ceiling, but we have one of our own: without
   * it, one `?limit=` gone astray and the tab receives a gigabyte of base64.
   */
  readonly bytes: Handler<'fs.bytes'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('path required');
    const limit = typeof params.limit === 'number' && params.limit > 0 ? Math.min(params.limit, MAX_BYTES) : MAX_BYTES;
    return ctx.session.requireWorkspace().services.os.bytes(params.path, limit);
  };

  /**
   * The absolute path. The client deliberately does not work it out itself: it knows
   * neither the project root nor this OS's separator.
   */
  readonly absolute: Handler<'fs.absolute'> = (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('path required');
    return { path: ctx.session.requireWorkspace().resolve(params.path) };
  };
}

/** One per server: the handlers are stateless, everything arrives in the context. */
export const fsMethods = new FsMethods();
