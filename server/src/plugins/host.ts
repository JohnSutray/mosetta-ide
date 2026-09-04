import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginInfo, PluginManifest } from '@ide/protocol';
import { pluginBuild } from './build.js';
import {
  activate,
  command,
  declaredOf,
  hooksOf,
  type CallContext,
  type CommandHandler,
  type FindProvider,
  type Ide,
  type PluginClass,
  type ShellChoice,
} from '@ide/api/server';
export { type CallContext } from '@ide/api/server';
import { workspaceOf } from './project.js';
import type { Workspace } from '../workspace/workspace.js';
import type { PackageManagerInfo, ShellInfo } from '@ide/protocol';
import type { Logger } from '../log.js';
import { processes } from '../env/processes.js';

interface Loaded {
  info: PluginInfo;
  dir: string;
  manifest: PluginManifest;
  clientCode?: string;
  methods: Map<string, CommandHandler>;
}

export interface Machine {
  shell(): ShellChoice;
  shells(): ShellInfo[];
  packageManagers(ws: Workspace): PackageManagerInfo[];
}

export class PluginHost {
  private readonly loaded = new Map<string, Loaded>();
  private readonly instances = new Map<unknown, unknown>();
  private readonly classes = new Map<string, unknown>();

  private readonly providers: FindProvider[] = [];

  constructor(
    private readonly log: Logger,
    private readonly buildDir: string,
    private readonly machine: Machine = {
      shell: () => ({ file: '', args: [], env: {} }),
      shells: () => [],
      packageManagers: () => [],
    },
  ) {}

  finds(): readonly FindProvider[] {
    return this.providers;
  }

  private expose(): void {
    const global_ = globalThis as Record<string, unknown>;
    global_.__ideApi = {
      ...((global_.__ideApi as object) ?? {}),
      api: { command, activate },
      plugins: this.classes,
    };
  }

  list(): PluginInfo[] {
    return [...this.loaded.values()].map((item) => item.info);
  }

  clientCode(name: string): string | null {
    return this.loaded.get(name)?.clientCode ?? null;
  }

  commands(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of this.loaded.values()) Object.assign(out, item.info.commands);
    return out;
  }

  async call(name: string, method: string, params: unknown, ctx: CallContext): Promise<unknown> {
    const plugin = this.loaded.get(name);
    if (!plugin) throw new Error(`нет плагина ${name}`);
    const handler = plugin.methods.get(method);
    if (!handler) throw new Error(`плагин ${name} не объявлял метод ${method}`);
    return handler(params, ctx);
  }

  async load(names: string[], resolveFrom: string): Promise<void> {
    this.expose();
    for (const name of await this.ordered(names, resolveFrom)) {
      try {
        await this.one(name, resolveFrom);
      } catch (err) {
        this.log.warn(`плагин ${name} не поднялся: ${String(err)}`);
        this.loaded.set(name, {
          info: {
            name,
            version: '?',
            state: 'failed',
            hasClient: false,
            hasServer: false,
            commands: {},
            needs: [],
            strings: {},
            error: String(err),
          },
          dir: '',
          manifest: { name, version: '?' },
          methods: new Map(),
        });
      }
    }
  }

  private async ordered(names: string[], resolveFrom: string): Promise<string[]> {
    const needs = new Map<string, string[]>();
    const provides = new Set<string>();
    for (const name of names) {
      const meta = await this.needsOf(name, resolveFrom).catch(() => ({ needs: [], provides: false }));
      needs.set(name, meta.needs);
      if (meta.provides) provides.add(name);
    }
    const out: string[] = [];
    const done = new Set<string>();
    const path: string[] = [];
    const visit = (name: string): void => {
      if (done.has(name)) return;
      if (path.includes(name)) {
        this.log.warn(`круг в зависимостях плагинов: ${[...path, name].join(' → ')}`);
        return;
      }
      path.push(name);
      for (const dep of needs.get(name) ?? []) if (names.includes(dep)) visit(dep);
      path.pop();
      done.add(name);
      out.push(name);
    };
    for (const name of names) if (provides.has(name)) visit(name);
    for (const name of names) visit(name);
    return out;
  }

  private async needsOf(
    name: string,
    resolveFrom: string,
  ): Promise<{ needs: string[]; provides: boolean }> {
    const pkg = JSON.parse(await fs.readFile(await manifestOf(name, resolveFrom), 'utf8')) as {
      ide?: { needs?: string[]; provides?: string };
    };
    return { needs: pkg.ide?.needs ?? [], provides: Boolean(pkg.ide?.provides) };
  }

  private async one(name: string, resolveFrom: string): Promise<void> {
    const pkgPath = await manifestOf(name, resolveFrom);
    const dir = path.dirname(pkgPath);
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name: string;
      version: string;
      ide?: Omit<PluginManifest, 'name' | 'version'>;
    };
    if (!pkg.ide) throw new Error('в package.json нет раздела "ide"');

    const manifest: PluginManifest = { name: pkg.name, version: pkg.version, ...pkg.ide };
    const methods = new Map<string, CommandHandler>();

    let strings: Record<string, string> = {};
    if (manifest.strings) {
      const at = path.join(dir, manifest.strings);
      try {
        strings = JSON.parse(await fs.readFile(at, 'utf8')) as Record<string, string>;
      } catch (err) {
        this.log.warn(`плагин ${name}: не прочитал ${at}: ${String(err)}`);
      }
    }

    const peers = manifest.needs ?? [];
    let clientCode: string | undefined;
    if (manifest.client) {
      const built = await pluginBuild.entry(path.join(dir, manifest.client), 'client', peers);
      clientCode = built.code;
      this.log.debug(`плагин ${name}: клиент собран за ${built.ms} мс`);
    }

    if (manifest.server) {
      const built = await pluginBuild.entry(path.join(dir, manifest.server), 'server', peers);
      await fs.mkdir(this.buildDir, { recursive: true });
      const out = path.join(this.buildDir, `${name.replace(/[^\w.-]/g, '_')}.server.mjs`);
      const before = await fs.readFile(out, 'utf8').catch(() => null);
      if (before !== built.code) await fs.writeFile(out, built.code, 'utf8');
      const mod = (await import(`${pathToFileURL(out).href}?v=${Date.now()}`)) as {
        default?: PluginClass;
      };
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') throw new Error('нет export default class');

      const ide: Ide = {
        name,
        method: (method: string, handler: CommandHandler) => methods.set(method, handler),
        getPlugin: <T,>(ctor: PluginClass<T>): T => {
          const found = this.instances.get(ctor);
          if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
          return found as T;
        },
        find: (provider) => this.providers.push(provider),
        shell: () => this.machine.shell(),
        shells: () => this.machine.shells(),
        packageManagers: (project) => {
          const ws = workspaceOf.get(project);
          if (!ws) throw new Error('проект не из этого сервера');
          return this.machine.packageManagers(ws);
        },
        run: (ask) => processes.run({ ...ask, reason: `${name}: ${ask.reason}` }),
        stream: (ask, onChunk) =>
          processes.stream({ ...ask, reason: `${name}: ${ask.reason}` }, onChunk),
        log: this.log,
      };
      const instance = new Ctor(ide) as object;
      this.classes.set(name, Ctor);
      this.instances.set(Ctor, instance);
      this.expose();
      for (const [method, handler] of declaredOf(instance)) methods.set(method, handler);
      await hooksOf(instance).start?.();
      this.log.debug(`плагин ${name}: сервер собран за ${built.ms} мс`);
    }

    this.loaded.set(name, {
      info: {
        name: manifest.name,
        version: manifest.version,
        state: 'ok',
        hasClient: Boolean(manifest.client),
        hasServer: Boolean(manifest.server),
        commands: manifest.commands ?? {},
        needs: peers,
        ...(manifest.provides ? { provides: manifest.provides } : {}),
        strings,
      },
      dir,
      manifest,
      clientCode,
      methods,
    });
    this.log.info(`плагин ${name}@${manifest.version} готов`);
  }
}

async function manifestOf(name: string, resolveFrom: string): Promise<string> {
  let dir = path.resolve(resolveFrom);
  for (;;) {
    const at = path.join(dir, 'node_modules', ...name.split('/'), 'package.json');
    try {
      await fs.access(at);
      return at;
    } catch {}
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`не нашёл пакет ${name} рядом с ${resolveFrom}`);
}
