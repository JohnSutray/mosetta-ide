import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('path: string required');
  }
  return params.path;
}

export class DocMethods {
  /**
   * The memory layer, documents. This, and only this, is what the editor works with.
   *
   * Why not `fs.read`/`fs.write`: the language server takes its text from the same
   * place, so diagnostics arrive against UNSAVED text. If the editor wrote to disk and
   * the server read disk, errors would only appear after a save — exactly what everyone
   * hates.
   */

  readonly open: Handler<'doc.open'> = async (params, ctx) => {
    const ram = ctx.session.requireWorkspace().services.ram;
    return ram.toDocState(await ram.openDoc(pathOf(params)));
  };

  readonly edit: Handler<'doc.edit'> = (params, ctx) => {
    if (typeof params?.text !== 'string') throw RpcError.invalidParams('text: string required');
    if (typeof params?.baseVersion !== 'number') {
      throw RpcError.invalidParams('baseVersion: number required');
    }
    const ram = ctx.session.requireWorkspace().services.ram;
    const doc = ram.editDoc(params.path, params.text, params.baseVersion);
    return { path: doc.path, version: doc.version, dirty: doc.dirty };
  };

  readonly save: Handler<'doc.save'> = async (params, ctx) => {
    const ram = ctx.session.requireWorkspace().services.ram;
    return ram.toDocState(await ram.saveDoc(pathOf(params)));
  };

  readonly reload: Handler<'doc.reload'> = async (params, ctx) => {
    const ram = ctx.session.requireWorkspace().services.ram;
    return ram.toDocState(await ram.reloadDoc(pathOf(params)));
  };

  readonly state: Handler<'doc.state'> = async (params, ctx) => {
    const ram = ctx.session.requireWorkspace().services.ram;
    return ram.toDocState(await ram.peekDoc(pathOf(params)));
  };

  /**
   * What is unsaved, as paths. Asked before launching a program: the program reads disk
   * while the human is looking at memory.
   */
  readonly unsaved: Handler<'doc.unsaved'> = (_params, ctx) => {
    return { paths: ctx.session.requireWorkspace().services.ram.unsavedDocs() };
  };

  readonly close: Handler<'doc.close'> = (params, ctx) => {
    ctx.session.requireWorkspace().services.ram.closeDoc(pathOf(params));
    return null;
  };
}

/** One per server: the handlers are stateless, everything arrives in the context. */
export const docMethods = new DocMethods();
