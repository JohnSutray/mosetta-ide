import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginInfo, PluginManifest } from '@ide/protocol';
import { PluginBuild } from './build.js';
import type { SharedModules } from './shared.js';
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
  type Project,
} from '@ide/api/server';
export { type CallContext } from '@ide/api/server';
import type { Settings } from '@ide/protocol';
import { PluginProject } from './project.js';
import type { Workspace } from '../workspace/workspace.js';
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
  settings(): Settings;
  environment(): Record<string, string>;
  which(name: string): string | null;
}

export class PluginHost {
  private readonly loaded = new Map<string, Loaded>();
  private readonly instances = new Map<unknown, unknown>();

  private readonly providers: FindProvider[] = [];

  private readonly projectHandlers = new Map<string, Array<(project: Project) => void>>();

  private readonly build: PluginBuild;

  constructor(
    private readonly log: Logger,
    private readonly stateDir: string,
    private readonly shared: SharedModules,
    private readonly machine: Machine = {
      settings: () => {
        throw new Error('настройки этому дому плагинов не дали');
      },
      environment: () => ({}),
      which: () => null,
    },
  ) {
    this.build = new PluginBuild(shared);
  }

  finds(): readonly FindProvider[] {
    return this.providers;
  }

  projectOpened(ws: Workspace): void {
    for (const [name, handlers] of this.projectHandlers) {
      for (const handler of handlers) {
        try {
          handler(new PluginProject(ws, name));
        } catch (err) {
          this.log.warn(`плагин ${name} не принял проект ${ws.name}: ${String(err)}`);
        }
      }
    }
  }

  private expose(): void {
    const global_ = globalThis as Record<string, unknown>;
    const had = (global_.__ideApi as { modules?: Record<string, unknown> } | undefined)?.modules ?? {};
    global_.__ideApi = {
      ...((global_.__ideApi as object) ?? {}),
      modules: { ...had, '@ide/api/server': { command, activate } },
    };
  }

  private serve(name: string, mod: unknown): void {
    const table = (globalThis as { __ideApi?: { modules: Record<string, unknown> } }).__ideApi;
    if (table) table.modules[name] = mod;
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

  async load(names: string[]): Promise<void> {
    this.expose();
    const { order, needs } = await this.ordered(names);
    for (const name of order) {
      try {
        await this.one(name, needs.get(name) ?? []);
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

  private async ordered(names: string[]): Promise<{ order: string[]; needs: Map<string, string[]> }> {
    const needs = new Map<string, string[]>();
    for (const name of names) {
      needs.set(name, await this.importsOf(name).then((all) => all.filter((one) => names.includes(one))).catch(() => []));
    }
    const out: string[] = [];
    const done = new Set<string>();
    const path_: string[] = [];
    const visit = (name: string): void => {
      if (done.has(name)) return;
      if (path_.includes(name)) {
        this.log.warn(`круг в зависимостях плагинов: ${[...path_, name].join(' → ')}`);
        return;
      }
      path_.push(name);
      for (const dep of needs.get(name) ?? []) visit(dep);
      path_.pop();
      done.add(name);
      out.push(name);
    };
    for (const name of names) visit(name);
    return { order: out, needs };
  }

  private async importsOf(name: string): Promise<string[]> {
    const pkgPath = await this.shared.manifestOf(name);
    const dir = path.dirname(pkgPath);
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { ide?: { client?: string; server?: string } };
    const out = new Set<string>();
    for (const [entry, side] of [[pkg.ide?.client, 'client'], [pkg.ide?.server, 'server']] as const) {
      if (!entry) continue;
      for (const one of await this.build.imports(path.join(dir, entry), side)) out.add(one);
    }
    return [...out];
  }

  private async one(name: string, needs: string[]): Promise<void> {
    const pkgPath = await this.shared.manifestOf(name);
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

    let clientCode: string | undefined;
    if (manifest.client) {
      const built = await this.build.entry(path.join(dir, manifest.client), 'client');
      clientCode = built.code;
      this.shared.register(name, 'client', built.exports);
      this.log.debug(`плагин ${name}: клиент собран за ${built.ms} мс`);
    }

    if (manifest.server) {
      const built = await this.build.entry(path.join(dir, manifest.server), 'server');
      this.shared.register(name, 'server', built.exports);
      const buildDir = path.join(this.stateDir, 'plugins-build');
      await fs.mkdir(buildDir, { recursive: true });
      const out = path.join(buildDir, `${name.replace(/[^\w.-]/g, '_')}.server.mjs`);
      const before = await fs.readFile(out, 'utf8').catch(() => null);
      if (before !== built.code) await fs.writeFile(out, built.code, 'utf8');
      const mod = (await import(`${pathToFileURL(out).href}?v=${Date.now()}`)) as {
        default?: PluginClass;
      };
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') throw new Error('нет export default class');
      this.serve(name, mod);

      const ide: Ide = {
        name,
        method: (method: string, handler: CommandHandler) => methods.set(method, handler),
        getPlugin: <T,>(ctor: PluginClass<T>): T => {
          const found = this.instances.get(ctor);
          if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
          return found as T;
        },
        find: (provider) => this.providers.push(provider),
        onProject: (handler) => {
          const list = this.projectHandlers.get(name) ?? [];
          list.push(handler);
          this.projectHandlers.set(name, list);
        },
        settings: () => this.machine.settings(),
        environment: () => this.machine.environment(),
        which: (name) => this.machine.which(name),
        run: (ask) => processes.run({ ...ask, reason: `${name}: ${ask.reason}` }),
        stream: (ask, onChunk) =>
          processes.stream({ ...ask, reason: `${name}: ${ask.reason}` }, onChunk),
        log: this.log,
        dir,
        state: path.join(this.stateDir, 'plugins', name.replace(/[^\w.-]/g, '_')),
      };
      const instance = new Ctor(ide) as object;
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
        needs,
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
