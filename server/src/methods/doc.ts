import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}

export class DocMethods {
  readonly open: Handler<'doc.open'> = async (params, ctx) => {
    const ram = ctx.session.requireWorkspace().services.ram;
    return ram.toDocState(await ram.openDoc(pathOf(params)));
  };

  readonly edit: Handler<'doc.edit'> = (params, ctx) => {
    if (typeof params?.text !== 'string') throw RpcError.invalidParams('нужен text: string');
    if (typeof params?.baseVersion !== 'number') {
      throw RpcError.invalidParams('нужен baseVersion: number');
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

  readonly mergeFromDisk: Handler<'doc.mergeFromDisk'> = (params, ctx) =>
    ctx.session.requireWorkspace().services.conflicts.forReload(pathOf(params));

  readonly close: Handler<'doc.close'> = (params, ctx) => {
    ctx.session.requireWorkspace().services.ram.closeDoc(pathOf(params));
    return null;
  };
}

export const docMethods = new DocMethods();
