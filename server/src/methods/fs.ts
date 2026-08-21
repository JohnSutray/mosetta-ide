import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';
import { listDir, readFile, writeFile } from '../workspace/files.js';

export const fsList: Handler<'fs.list'> = (params, ctx) => {
  const ws = ctx.session.requireWorkspace();
  return listDir(ws, pathOf(params));
};

export const fsRead: Handler<'fs.read'> = (params, ctx) => {
  const ws = ctx.session.requireWorkspace();
  return readFile(ws, pathOf(params));
};

export const fsWrite: Handler<'fs.write'> = (params, ctx) => {
  const ws = ctx.session.requireWorkspace();
  if (typeof params?.text !== 'string') throw RpcError.invalidParams('нужен text: string');
  return writeFile(ws, pathOf(params), params.text, params.expectedRevision);
};

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}
