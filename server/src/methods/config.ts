import { RpcError } from '../errors.js';
import { defaults } from '../config/defaults.js';
import type { Handler } from '../rpc/context.js';

function complaintFor(section: string, key: string, value: string | boolean): string | null {
  const table = defaults.settings as unknown as Record<string, Record<string, unknown> | undefined>;
  const own = table[section];
  if (!own) return null;
  const known = own[key];
  if (known === undefined) return `такой настройки нет: ${section}.${key}`;
  if (typeof known !== 'string' && typeof known !== 'boolean') {
    return `${section}.${key} правят руками: это не строка и не флаг`;
  }
  if (typeof known !== typeof value) return `${section}.${key} ждёт ${typeof known}`;
  return null;
}

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
    const value = typeof params.value === 'string' ? params.value.trim() : params.value;
    const complaint = complaintFor(params.section, params.key, value);
    if (complaint) throw RpcError.invalidParams(complaint);

    await ctx.config.set(params.section, params.key, value);
    return { section: params.section, key: params.key, value };
  };
}

export const configMethods = new ConfigMethods();
