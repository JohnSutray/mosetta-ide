import type { SettingValue } from '@mosetta/ide-protocol';
import { RpcError } from '../errors.js';
import { defaults } from '../config/defaults.js';
import type { Handler } from '../rpc/context.js';

/**
 * The kind of a value: a scalar, a list of strings, any other list, or an object.
 * `null` means it is not a setting value at all (a function, `undefined`), and such a
 * thing is not written.
 */
function kindOf(value: unknown): string | null {
  if (Array.isArray(value)) return value.every((one) => typeof one === 'string') ? 'string[]' : 'array';
  if (value === null) return null;
  const kind = typeof value;
  if (kind === 'object') return 'object';
  return kind === 'string' || kind === 'boolean' || kind === 'number' ? kind : null;
}

/**
 * What a client is allowed to write. CORE sections are validated against the core's
 * defaults; plugin sections are unknown to the core — their declaration lies in the
 * client's registry, and the client validates against it before calling this method.
 * What reaches here is a string, a number, a flag or a list of strings — exactly what a
 * surgical file edit can handle.
 */
function complaintFor(section: string, key: string, value: SettingValue): string | null {
  const table = defaults.settings as unknown as Record<string, Record<string, unknown> | undefined>;
  const own = table[section];
  if (!own) return null;
  const known = own[key];
  if (known === undefined) return `no such setting: ${section}.${key}`;
  const expected = kindOf(known);
  if (expected === null) return `${section}.${key} is edited by hand: such a value cannot be written`;
  if (expected !== kindOf(value)) return `${section}.${key} expects ${expected}`;
  return null;
}

/**
 * Settings are handed out by the server. The client has no file access of its own, and
 * that is for the better: there is one source of truth, and an edit to a settings file
 * reaches every tab as a `config.changed` event.
 */
export class ConfigMethods {
  /** THIS tab's config: the personal layer plus the project's, if a project is open. */
  readonly get: Handler<'config.get'> = (_params, ctx) =>
    ctx.session.workspace?.projectConfig.bundle ?? ctx.config.current;

  /**
   * Write a setting.
   *
   * We write into the settings file — the very one a human edits by hand and carries
   * between machines. Choosing a shell or a package manager is a setting rather than
   * state: it has to survive a restart and travel to a second machine along with the
   * rest of the config.
   */
  readonly set: Handler<'config.set'> = async (params, ctx) => {
    if (
      !params ||
      typeof params.section !== 'string' ||
      typeof params.key !== 'string' ||
      kindOf(params.value) === null
    ) {
      throw RpcError.invalidParams('section, key and value required: a scalar, a list or an object');
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

  /**
   * Reset a setting to factory: the key leaves the files — both of them. "Factory"
   * means there is no value of your own anywhere: removing it from the personal file
   * while leaving it in the project's would be a move rather than a reset.
   */
  readonly reset: Handler<'config.reset'> = async (params, ctx) => {
    if (!params || typeof params.section !== 'string' || typeof params.key !== 'string') {
      throw RpcError.invalidParams('section and key required');
    }
    await ctx.config.unset(params.section, params.key);
    await ctx.session.workspace?.projectConfig.unset(params.section, params.key);
    return { section: params.section, key: params.key };
  };
}

/** One per server: the handlers are stateless, everything arrives in the context. */
export const configMethods = new ConfigMethods();
