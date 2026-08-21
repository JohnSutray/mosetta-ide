import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const termList: Handler<'term.list'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.terminals.list();

export const termCreate: Handler<'term.create'> = (params, ctx) => {
  const services = ctx.session.requireWorkspace().services;
  return services.createTerminal({
    ...(params?.cols ? { cols: params.cols } : {}),
    ...(params?.rows ? { rows: params.rows } : {}),
  });
};

export const termOpen: Handler<'term.open'> = (params, ctx) => {
  const name = nameOf(params);
  const services = ctx.session.requireWorkspace().services;
  return services.openTerminal({
    name,
    ...(params?.kind ? { kind: params.kind } : {}),
    ...(params?.command ? { command: params.command } : {}),
    ...(params?.cwd ? { cwd: params.cwd } : {}),
    ...(params?.cols ? { cols: params.cols } : {}),
    ...(params?.rows ? { rows: params.rows } : {}),
  });
};

export const termAttach: Handler<'term.attach'> = (params, ctx) =>
  ctx.session.requireWorkspace().services.terminals.attach(nameOf(params));

export const termWrite: Handler<'term.write'> = (params, ctx) => {
  if (typeof params?.data !== 'string') throw RpcError.invalidParams('нужен data: string');
  ctx.session.requireWorkspace().services.terminals.write(nameOf(params), params.data);
  return null;
};

export const termResize: Handler<'term.resize'> = (params, ctx) => {
  if (typeof params?.cols !== 'number' || typeof params?.rows !== 'number') {
    throw RpcError.invalidParams('нужны cols и rows');
  }
  ctx.session.requireWorkspace().services.terminals.resize(nameOf(params), params.cols, params.rows);
  return null;
};

export const termClose: Handler<'term.close'> = (params, ctx) => {
  ctx.session.requireWorkspace().services.terminals.close(nameOf(params));
  return null;
};

function nameOf(params: { name?: unknown } | null): string {
  if (!params || typeof params.name !== 'string' || params.name.trim() === '') {
    throw RpcError.invalidParams('нужен name: string');
  }
  return params.name;
}
