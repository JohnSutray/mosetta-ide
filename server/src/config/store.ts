import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isCommandId,
  type ConfigBundle,
  type KeyBinding,
  type Keymap,
  type Settings,
} from '@mosetta/ide-protocol';
import type { SettingValue } from '@mosetta/ide-protocol';
import { journal } from '../log.js';
import { defaults } from './defaults.js';
import { jsonc } from './jsonc.js';
import { patch } from './patch.js';

const log = journal.logger('config');

const WATCHED = new Set(['settings.json', 'keymap.json']);

export class ConfigStore {
  private bundle: ConfigBundle;
  private readonly listeners = new Set<(bundle: ConfigBundle) => void>();
  private readonly watchers: fs.FSWatcher[] = [];
  private reloadTimer: NodeJS.Timeout | null = null;

  private constructor(
    readonly dir: string,
    initial: ConfigBundle,
  ) {
    this.bundle = initial;
  }

  static async load(dir = defaultConfigDir()): Promise<ConfigStore> {
    const store = new ConfigStore(dir, { settings: defaults.settings, keymap: defaults.emptyKeymap, sources: [] });
    store.bundle = await store.read();
    return store;
  }

  get current(): ConfigBundle {
    return this.bundle;
  }

  get settings(): Settings {
    return this.bundle.settings;
  }

  onChange(listener: (bundle: ConfigBundle) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  watch(): void {
    try {
      const watcher = fs.watch(this.dir, (_event, name) => {
        if (name === null || WATCHED.has(String(name))) this.scheduleReload();
      });
      watcher.unref?.();
      this.watchers.push(watcher);
    } catch {}
  }

  private writing: Promise<unknown> = Promise.resolve();

  set(section: string, key: string, value: SettingValue): Promise<{ rewritten: boolean }> {
    const next = this.writing.then(() => this.write(section, key, value));
    this.writing = next.catch(() => undefined);
    return next;
  }

  private async write(section: string, key: string, value: SettingValue): Promise<{ rewritten: boolean }> {
    const file = path.join(this.dir, 'settings.json');
    let raw = '';
    try {
      raw = await fsp.readFile(file, 'utf8');
    } catch {}
    const patched = patch.setting(raw, section, key, value);
    await fsp.mkdir(this.dir, { recursive: true });
    await fsp.writeFile(file, patched.text, 'utf8');
    if (patched.rewritten) log.warn('settings.json пересобран — комментарии в нём не сохранились');
    await this.reload();
    return { rewritten: patched.rewritten };
  }

  dispose(): void {
    for (const watcher of this.watchers.splice(0)) watcher.close();
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      void this.reload();
    }, 80);
  }

  async reload(): Promise<void> {
    const next = await this.read();
    this.bundle = next;
    log.info('перечитан');
    for (const listener of this.listeners) listener(next);
  }

  private async read(): Promise<ConfigBundle> {
    const sources: string[] = [];
    const settings = mergeSettings(
      defaults.settings,
      await this.readFile<Partial<Settings>>('settings.json', sources),
    );
    const rawKeymap = await this.readFile<Keymap>('keymap.json', sources);
    return { settings, keymap: keymapRules.validate(rawKeymap), sources };
  }

  private async readFile<T>(name: string, sources: string[]): Promise<T | null> {
    const target = path.join(this.dir, name);
    let text: string;
    try {
      text = await fsp.readFile(target, 'utf8');
    } catch {
      log.warn(`нет ${target} — беру дефолты`);
      return null;
    }
    try {
      const parsed = jsonc.parse<T>(text, target);
      sources.push(target);
      return parsed;
    } catch (err) {
      log.error(`${name} не разобран, работаю на дефолтах: ${String(err)}`);
      return null;
    }
  }
}

function mergeSettings(base: Settings, override: Partial<Settings> | null): Settings {
  if (!override) return base;
  return deepMerge(base, override) as Settings;
}

function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) return override ?? base;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    out[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ALIASES: Record<string, string> = {
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  windows: 'meta',
  super: 'meta',
  ctrl: 'control',
  option: 'alt',
  opt: 'alt',
  esc: 'escape',
  return: 'enter',
};

function defaultConfigDir(): string {
  if (process.env.IDE_CONFIG_DIR) return path.resolve(process.env.IDE_CONFIG_DIR);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', '..', 'config');
}

export class KeymapRules {
  validate(raw: Keymap | null): Keymap {
    if (!raw || !Array.isArray(raw.bindings)) return defaults.emptyKeymap;
    const seen = new Map<string, KeyBinding>();
    const bindings: KeyBinding[] = [];

    for (const binding of raw.bindings) {
      if (!binding || typeof binding.key !== 'string' || typeof binding.command !== 'string') {
        log.error(`битый биндинг в keymap.json: ${JSON.stringify(binding)}`);
        continue;
      }
      if (!isCommandId(binding.command)) {
        log.debug(`keymap.json: ${binding.command} — не наша команда, ждём плагин`);
      }
      const where = [...(binding.where ?? [])].sort().join(',');
      const slot = `${where}|${binding.when ?? 'global'}:${this.normalizeKey(binding.key)}`;
      const previous = seen.get(slot);
      if (previous) {
        log.error(
          `keymap.json: ${binding.key} (${binding.when ?? 'global'}) занята ` +
            `командой ${previous.command}, ${binding.command} проигнорирована`,
        );
        continue;
      }
      seen.set(slot, binding);
      bindings.push({ ...binding, key: this.normalizeKey(binding.key) });
    }

    return { version: raw.version ?? 1, bindings };
  }

  normalizeKey(key: string): string {
    if (key.toLowerCase().startsWith('double:')) {
      const name = key.slice('double:'.length).trim().toLowerCase();
      return `double:${ALIASES[name] ?? name}`;
    }
    const parts = key
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ALIASES[p] ?? p);
    const main = parts.pop() ?? '';
    const order = ['meta', 'control', 'alt', 'shift'];
    const mods = order.filter((m) => parts.includes(m));
    return [...mods, main].join('+');
  }
}

export const keymapRules = new KeymapRules();
