import { RpcError } from '../errors.js';
import { shellExists } from '../env/shell.js';
import type { Handler } from '../rpc/context.js';

export const configGet: Handler<'config.get'> = (_params, ctx) => ctx.config.current;

const WRITABLE: Record<string, (value: string | boolean) => string | null> = {
  'terminal.shell': (value) =>
    value === '' || (typeof value === 'string' && shellExists(value))
      ? null
      : `нет такого файла: ${String(value)}`,
  'tools.packageManager': () => null,
  'tree.followEditor': (value) =>
    typeof value === 'boolean' ? null : 'здесь ждут true или false',
};

export const configSet: Handler<'config.set'> = async (params, ctx) => {
  if (
    !params ||
    typeof params.section !== 'string' ||
    typeof params.key !== 'string' ||
    (typeof params.value !== 'string' && typeof params.value !== 'boolean')
  ) {
    throw RpcError.invalidParams('нужны section, key и value: string либо boolean');
  }
  const full = `${params.section}.${params.key}`;
  const check = WRITABLE[full];
  if (!check) throw RpcError.invalidParams(`эту настройку правят руками: ${full}`);

  const value = typeof params.value === 'string' ? params.value.trim() : params.value;
  const complaint = check(value);
  if (complaint) throw RpcError.invalidParams(complaint);

  await ctx.config.set(params.section, params.key, value);
  return { section: params.section, key: params.key, value };
};
