import type { SettingValue } from '@mosetta/ide-protocol';
import { RpcError } from '../errors.js';
import { defaults } from '../config/defaults.js';
import type { Handler } from '../rpc/context.js';

function kindOf(value: unknown): string | null {
  if (Array.isArray(value)) return value.every((one) => typeof one === 'string') ? 'string[]' : 'array';
  if (value === null) return null;
  const kind = typeof value;
  if (kind === 'object') return 'object';
  return kind === 'string' || kind === 'boolean' || kind === 'number' ? kind : null;
}

function complaintFor(section: string, key: string, value: SettingValue): string | null {
  const table = defaults.settings as unknown as Record<string, Record<string, unknown> | undefined>;
  const own = table[section];
  if (!own) return null;
  const known = own[key];
  if (known === undefined) return `такой настройки нет: ${section}.${key}`;
  const expected = kindOf(known);
  if (expected === null) return `${section}.${key} правят руками: такое значение не записать`;
  if (expected !== kindOf(value)) return `${section}.${key} ждёт ${expected}`;
  return null;
}

export class ConfigMethods {
  readonly get: Handler<'config.get'> = (_params, ctx) =>
    ctx.session.workspace?.projectConfig.bundle ?? ctx.config.current;

  readonly set: Handler<'config.set'> = async (params, ctx) => {
    if (
      !params ||
      typeof params.section !== 'string' ||
      typeof params.key !== 'string' ||
      kindOf(params.value) === null
    ) {
      throw RpcError.invalidParams('нужны section, key и value: скаляр, список или объект');
    }
    const value = typeof params.value === 'string' ? params.value.trim() : params.value;
    const complaint = complaintFor(params.section, params.key, value);
    if (complaint) throw RpcError.invalidParams(complaint);

    if (params.scope === 'project') {
      const project = ctx.session.requireWorkspace().projectConfig;
      await project.set(params.section, params.key, value);
      await ctx.config.unset(params.section, params.key);
    } else {
      await ctx.config.set(params.section, params.key, value);
      await ctx.session.workspace?.projectConfig.unset(params.section, params.key);
    }
    return { section: params.section, key: params.key, value };
  };

  readonly reset: Handler<'config.reset'> = async (params, ctx) => {
    if (!params || typeof params.section !== 'string' || typeof params.key !== 'string') {
      throw RpcError.invalidParams('нужны section и key');
    }
    await ctx.config.unset(params.section, params.key);
    await ctx.session.workspace?.projectConfig.unset(params.section, params.key);
    return { section: params.section, key: params.key };
  };
}

export const configMethods = new ConfigMethods();
