import { RpcError } from '../errors.js';
import { shellExists } from '../env/shell.js';
import type { Handler } from '../rpc/context.js';

export const configGet: Handler<'config.get'> = (_params, ctx) => ctx.config.current;

const WRITABLE: Record<string, (value: string) => string | null> = {
  'terminal.shell': (value) =>
    value === '' || shellExists(value) ? null : `нет такого файла: ${value}`,
  'tools.packageManager': () => null,
};

export const configSet: Handler<'config.set'> = async (params, ctx) => {
  if (
    !params ||
    typeof params.section !== 'string' ||
    typeof params.key !== 'string' ||
    typeof params.value !== 'string'
  ) {
    throw RpcError.invalidParams('нужны section, key и value: string');
  }
  const full = `${params.section}.${params.key}`;
  const check = WRITABLE[full];
  if (!check) throw RpcError.invalidParams(`эту настройку правят руками: ${full}`);

  const value = params.value.trim();
  const complaint = check(value);
  if (complaint) throw RpcError.invalidParams(complaint);

  await ctx.config.set(params.section, params.key, value);
  return { section: params.section, key: params.key, value };
};
