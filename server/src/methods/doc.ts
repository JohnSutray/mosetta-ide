import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';
import { toDocState } from '../fs/ram-fs.js';

export const docOpen: Handler<'doc.open'> = async (params, ctx) => {
  const ram = ctx.session.requireWorkspace().services.ram;
  return toDocState(await ram.openDoc(pathOf(params)));
};

export const docEdit: Handler<'doc.edit'> = (params, ctx) => {
  if (typeof params?.text !== 'string') throw RpcError.invalidParams('нужен text: string');
  if (typeof params?.baseVersion !== 'number') {
    throw RpcError.invalidParams('нужен baseVersion: number');
  }
  const ram = ctx.session.requireWorkspace().services.ram;
  const doc = ram.editDoc(params.path, params.text, params.baseVersion);
  return { path: doc.path, version: doc.version, dirty: doc.dirty };
};

export const docSave: Handler<'doc.save'> = async (params, ctx) => {
  const ram = ctx.session.requireWorkspace().services.ram;
  return toDocState(await ram.saveDoc(pathOf(params)));
};

export const docReload: Handler<'doc.reload'> = async (params, ctx) => {
  const ram = ctx.session.requireWorkspace().services.ram;
  return toDocState(await ram.reloadDoc(pathOf(params)));
};

export const docClose: Handler<'doc.close'> = (params, ctx) => {
  ctx.session.requireWorkspace().services.ram.closeDoc(pathOf(params));
  return null;
};

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}
