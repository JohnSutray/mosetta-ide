import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginInfo, PluginManifest } from '@mosetta/ide-protocol';
import { PluginBuild } from './build.js';
import type { SharedModules } from './shared.js';
import {
  activate,
  command,
  declaredOf,
  hooksOf,
  type CallContext,
  type CommandHandler,
  type Ide,
  type PluginClass,
  type Project,
} from '@mosetta/ide-api/server';
export { type CallContext } from '@mosetta/ide-api/server';
import type { Settings } from '@mosetta/ide-protocol';
import { sectionOf } from '@mosetta/ide-api/section';
import { PluginProject } from './project.js';
import type { Workspace } from '../workspace/workspace.js';
import type { Logger } from '../log.js';
import { Env } from '../env/env.js';
import type { Processes } from '../env/processes.js';
import { legacyNames } from '@mosetta/ide-protocol';

/**
 * A home for plugins.
 *
 * It builds them from source, keeps what was built, and calls the server halves. It
 * knows nothing about WHAT a plugin does: it gives it a place to declare methods and
 * files them in its own table.
 *
 * The core stays closed while this happens: a plugin method is not called like an
 * ordinary one (`doc.open`) but through `plugins.call`, with the plugin's name. There
 * is nowhere for two plugins to collide, and the core's types are not blurred into a
 * shared union.
 */

interface Loaded {
  info: PluginInfo;
  dir: string;
  manifest: PluginManifest;
  clientCode?: string;
  methods: Map<string, CommandHandler>;
}

/**
 * What the plugins' home knows about the MACHINE and the HUMAN: the settings, their
 * shell's environment, where a program lies in their PATH. As functions rather than
 * values: settings are picked up without a restart. The home knows nothing about the
 * config or about the `env/` axis — whoever assembles the whole server brings them
 * together.
 */
export interface Machine {
  settings(): Settings;
  environment(): Record<string, string>;
  which(name: string): string | null;
  /** The server's process ledger: plugins' launches go into it. */
  readonly processes: Pick<Processes, 'run' | 'stream' | 'adopt' | 'start' | 'killTree'>;
}

export class PluginHost {
  private readonly loaded = new Map<string, Loaded>();
  /** The live instances by their class: the key is the constructor itself. */
  private readonly instances = new Map<unknown, unknown>();

  /** Who wants to know that a project opened, by plugin name. */
  private readonly projectHandlers = new Map<string, Array<(project: Project) => void>>();

  private readonly build: PluginBuild;

  constructor(
    private readonly log: Logger,
    /** The server's state outside the project, as a parameter. */
    private readonly stateDir: string,
    /** The shared table: what was brought up once and is imported by name. */
    private readonly shared: SharedModules,
    /** The machine and the user behind it; without them, empty answers. */
    private readonly machine: Machine = {
      settings: () => {
        throw new Error('this plugin host was given no settings');
      },
      environment: () => ({}),
      which: () => null,
      processes: new Env().processes,
    },
  ) {
    this.build = new PluginBuild(shared);
  }

  /**
   * A workspace shown to a plugin as a project. Assembled HERE rather than by every
   * caller: a project has the server's process ledger, and it is the plugins' home that
   * knows it.
   */
  projectFor(ws: Workspace, plugin: string): PluginProject {
    return new PluginProject(ws, plugin, this.machine.processes);
  }

  projectOpened(ws: Workspace): void {
    for (const [name, handlers] of this.projectHandlers) {
      for (const handler of handlers) {
        try {
          handler(this.projectFor(ws, name));
        } catch (err) {
          this.log.warn(`plugin ${name} did not accept the project ${ws.name}: ${String(err)}`);
        }
      }
    }
  }

  /**
   * What a plugin's server half sees under the name `@mosetta/ide-api`. Set once: the
   * substituted imports look here.
   */
  private expose(): void {
    const global_ = globalThis as Record<string, unknown>;
    const had = (global_.__ideApi as { modules?: Record<string, unknown> } | undefined)?.modules ?? {};
    global_.__ideApi = {
      ...((global_.__ideApi as object) ?? {}),
      modules: { ...had, '@mosetta/ide-api/server': { command, activate } },
    };
  }

  /** Put a module that came up onto the table under its own name. */
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

  /** Every command of every plugin: the keymap needs to know about them before startup. */
  commands(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const item of this.loaded.values()) Object.assign(out, item.info.commands);
    return out;
  }

  async call(name: string, method: string, params: unknown, ctx: CallContext): Promise<unknown> {
    const plugin = this.loaded.get(name);
    if (!plugin) throw new Error(`no plugin ${name}`);
    const handler = plugin.methods.get(method);
    if (!handler) throw new Error(`plugin ${name} did not declare the method ${method}`);
    return handler(params, ctx);
  }

  /**
   * Bring a list of plugins up. ONE of them failing does not stop the others: a plugin
   * that crashes has no right to take the editor with it, and it reports the reason as
   * a line rather than as silence.
   */
  async load(names: string[]): Promise<void> {
    this.expose();
    const { order, needs } = await this.ordered(names);
    for (const name of order) {
      try {
        await this.one(name, needs.get(name) ?? []);
      } catch (err) {
        this.log.warn(`plugin ${name} did not come up: ${String(err)}`);
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

  /**
   * The load order: those that others depend on come first.
   *
   * Dependencies are not declared — they are DERIVED from the imports: a quick esbuild
   * pass over both entry points hands back the bare names, and the ones matching
   * enabled plugins are the graph. This is not for elegance: a substituted import of a
   * neighbour reads from the table, and by the time the module is resolved the
   * neighbour has to be lying there. A cycle is an error said out loud rather than half
   * the list quietly dropped.
   */
  private async ordered(names: string[]): Promise<{ order: string[]; needs: Map<string, string[]> }> {
    const needs = new Map<string, string[]>();
    for (const name of names) {
      needs.set(
        name,
        await this.importsOf(name)
          .then((all) => all.map(serverHalfOf).filter((one) => names.includes(one)))
          .catch(() => []),
      );
    }
    const out: string[] = [];
    const done = new Set<string>();
    const path_: string[] = [];
    const visit = (name: string): void => {
      if (done.has(name)) return;
      if (path_.includes(name)) {
        this.log.warn(`a cycle in the plugin dependencies: ${[...path_, name].join(' → ')}`);
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

  /** The bare imports of both halves of a plugin. */
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

  /**
   * A plugin's state directory, named after it. The rebrand changed the package names,
   * and a directory under an old name moves over once: the recent projects, the caret
   * history and the completion choices survive.
   */
  private async stateOf(name: string): Promise<string> {
    const root = path.join(this.stateDir, 'plugins');
    const safe = (one: string) => one.replace(/[^\w.-]/g, '_');
    const dir = path.join(root, safe(name));
    const old = legacyNames.legacyOf(name);
    if (!old) return dir;
    const was = path.join(root, safe(old));
    try {
      await fs.access(dir);
    } catch {
      try {
        await fs.rename(was, dir);
        this.log.info(`${name}: state moved over from the old name ${old}`);
      } catch {}
    }
    return dir;
  }

  private async one(name: string, needs: string[]): Promise<void> {
    const pkgPath = await this.shared.manifestOf(name);
    const dir = path.dirname(pkgPath);
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name: string;
      version: string;
      ide?: Omit<PluginManifest, 'name' | 'version'>;
    };
    if (!pkg.ide) throw new Error('package.json has no "ide" section');

    const manifest: PluginManifest = { name: pkg.name, version: pkg.version, ...pkg.ide };
    const methods = new Map<string, CommandHandler>();

    const strings: Record<string, Record<string, string>> = {};
    const dictionaries =
      typeof manifest.strings === 'string' ? { en: manifest.strings } : (manifest.strings ?? {});
    for (const [locale, file] of Object.entries(dictionaries)) {
      const at = path.join(dir, file);
      try {
        strings[locale] = JSON.parse(await fs.readFile(at, 'utf8')) as Record<string, string>;
      } catch (err) {
        this.log.warn(`plugin ${name}: could not read ${at}: ${String(err)}`);
      }
    }

    let clientCode: string | undefined;
    if (manifest.client) {
      const built = await this.build.entry(path.join(dir, manifest.client), 'client');
      clientCode = built.code;
      this.shared.register(name, 'client', built.exports);
      this.log.debug(`plugin ${name}: client built in ${built.ms} ms`);
    }

    if (manifest.server) {
      const built = await this.build.entry(path.join(dir, manifest.server), 'server');
      this.shared.register(name, 'server', built.exports);
      this.shared.register(`${name}/server`, 'server', built.exports);
      const buildDir = path.join(this.stateDir, 'plugins-build');
      await fs.mkdir(buildDir, { recursive: true });
      const out = path.join(buildDir, `${name.replace(/[^\w.-]/g, '_')}.server.mjs`);
      const before = await fs.readFile(out, 'utf8').catch(() => null);
      if (before !== built.code) await fs.writeFile(out, built.code, 'utf8');
      const mod = (await import(`${pathToFileURL(out).href}?v=${Date.now()}`)) as {
        default?: PluginClass;
      };
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') throw new Error('no export default class');
      this.serve(name, mod);
      this.serve(`${name}/server`, mod);

      const ide: Ide = {
        name,
        method: (method: string, handler: CommandHandler) => methods.set(method, handler),
        getPlugin: <T,>(ctor: PluginClass<T>): T => {
          const found = this.instances.get(ctor);
          if (!found) throw new Error(`plugin not up: ${ctor.name}`);
          return found as T;
        },
        onProject: (handler) => {
          const list = this.projectHandlers.get(name) ?? [];
          list.push(handler);
          this.projectHandlers.set(name, list);
        },
        settings: (section, defaults) => sectionOf(this.machine.settings(), section, defaults),
        environment: () => this.machine.environment(),
        which: (name) => this.machine.which(name),
        run: (ask) => this.machine.processes.run({ ...ask, reason: `${name}: ${ask.reason}` }),
        stream: (ask, onChunk) =>
          this.machine.processes.stream({ ...ask, reason: `${name}: ${ask.reason}` }, onChunk),
        killTree: (pid, options) => this.machine.processes.killTree(pid, options),
        log: this.log,
        dir,
        state: await this.stateOf(name),
      };
      const instance = new Ctor(ide) as object;
      this.instances.set(Ctor, instance);
      this.expose();
      for (const [method, handler] of declaredOf(instance)) methods.set(method, handler);
      await hooksOf(instance).start?.();
      this.log.debug(`plugin ${name}: server built in ${built.ms} ms`);
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
    this.log.info(`plugin ${name}@${manifest.version} ready`);
  }
}

/**
 * `@mosetta/ide-plugin-x/server` → `@mosetta/ide-plugin-x`: the name of the plugin
 * whose half is being imported.
 */
function serverHalfOf(spec: string): string {
  return spec.endsWith('/server') ? spec.slice(0, -'/server'.length) : spec;
}
