import { RpcErrorCode } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const lspStatus: Handler<'lsp.status'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.statuses();

export const lspDiagnostics: Handler<'lsp.diagnostics'> = (params, ctx) => {
  const path = pathOf(params);
  const services = ctx.session.requireWorkspace().services;
  const server = services.lspFor(path);
  return { path, diagnostics: server?.diagnosticsFor(path) ?? [] };
};

export const lspHover: Handler<'lsp.hover'> = (params, ctx) => {
  const path = pathOf(params);
  if (typeof params?.line !== 'number' || typeof params?.character !== 'number') {
    throw RpcError.invalidParams('нужны line и character');
  }
  const services = ctx.session.requireWorkspace().services;
  const server = services.lspFor(path);
  if (!server) {
    throw new RpcError(RpcErrorCode.LspUnavailable, `Нет языкового сервера для ${path}`);
  }
  return server.hover(path, params.line, params.character);
};

function pathOf(params: { path?: unknown } | null): string {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  return params.path;
}
