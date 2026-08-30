import { RpcError } from '../errors.js';
import { shells } from '../env/shell.js';
import type { Handler } from '../rpc/context.js';

const WRITABLE: Record<string, (value: string | boolean) => string | null> = {
  'terminal.shell': (value) =>
    value === '' || (typeof value === 'string' && shells.resolveShell(value) !== null)
      ? null
      : `не нашёл такую оболочку: ${String(value)}`,
  'tools.packageManager': () => null,
  'tree.followEditor': (value) =>
    typeof value === 'boolean' ? null : 'здесь ждут true или false',
};

export class ConfigMethods {
  readonly get: Handler<'config.get'> = (_params, ctx) => ctx.config.current;

  readonly set: Handler<'config.set'> = async (params, ctx) => {
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
}

export const configMethods = new ConfigMethods();
