import { RpcError } from '../errors.js';
import { shellExists } from '../env/shell.js';
import type { Handler } from '../rpc/context.js';

export const configGet: Handler<'config.get'> = (_params, ctx) => ctx.config.current;

export const configSetShell: Handler<'config.setShell'> = async (params, ctx) => {
  if (!params || typeof params.path !== 'string') {
    throw RpcError.invalidParams('нужен path: string');
  }
  const chosen = params.path.trim();
  if (chosen !== '' && !shellExists(chosen)) {
    throw RpcError.invalidParams(`нет такого файла: ${chosen}`);
  }
  await ctx.config.set('terminal', 'shell', chosen);
  return { path: chosen };
};
