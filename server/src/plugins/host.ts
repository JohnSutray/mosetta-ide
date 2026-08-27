import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import type { PluginInfo, PluginManifest } from '@ide/protocol';
import { buildEntry } from './build.js';
import { Plugin, command, type CallContext, type CommandHandler } from './api.js';
export { type CallContext } from './api.js';
import type { Logger } from '../log.js';

interface Loaded {
  info: PluginInfo;
  dir: string;
  manifest: PluginManifest;
  clientCode?: string;
  methods: Map<string, CommandHandler>;
}

export class PluginHost {
  private readonly loaded = new Map<string, Loaded>();
  private readonly instances = new Map<unknown, unknown>();
  private readonly classes = new Map<string, unknown>();

  constructor(
    private readonly log: Logger,
    private readonly buildDir: string,
  ) {}

  private expose(): void {
    const global_ = globalThis as Record<string, unknown>;
    global_.__ideApi = {
      ...((global_.__ideApi as object) ?? {}),
      api: { Plugin, command },
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
    for (const name of names) {
      needs.set(name, await this.needsOf(name, resolveFrom).catch(() => []));
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
    for (const name of names) visit(name);
    return out;
  }

  private async needsOf(name: string, resolveFrom: string): Promise<string[]> {
    const require_ = createRequire(path.join(resolveFrom, 'noop.js'));
    const pkg = JSON.parse(
      await fs.readFile(require_.resolve(`${name}/package.json`), 'utf8'),
    ) as { ide?: { needs?: string[] } };
    return pkg.ide?.needs ?? [];
  }

  private async one(name: string, resolveFrom: string): Promise<void> {
    const require_ = createRequire(path.join(resolveFrom, 'noop.js'));
    const pkgPath = require_.resolve(`${name}/package.json`);
    const dir = path.dirname(pkgPath);
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      name: string;
      version: string;
      ide?: Omit<PluginManifest, 'name' | 'version'>;
    };
    if (!pkg.ide) throw new Error('в package.json нет раздела "ide"');

    const manifest: PluginManifest = { name: pkg.name, version: pkg.version, ...pkg.ide };
    const methods = new Map<string, CommandHandler>();

    const peers = manifest.needs ?? [];
    let clientCode: string | undefined;
    if (manifest.client) {
      const built = await buildEntry(path.join(dir, manifest.client), 'client', peers);
      clientCode = built.code;
      this.log.debug(`плагин ${name}: клиент собран за ${built.ms} мс`);
    }

    if (manifest.server) {
      const built = await buildEntry(path.join(dir, manifest.server), 'server', peers);
      await fs.mkdir(this.buildDir, { recursive: true });
      const out = path.join(this.buildDir, `${name.replace(/[^\w.-]/g, '_')}.server.mjs`);
      await fs.writeFile(out, built.code, 'utf8');
      const mod = (await import(`${pathToFileURL(out).href}?v=${Date.now()}`)) as {
        default?: new () => Plugin;
      };
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') throw new Error('нет export default class');
      const instance = new Ctor();
      Object.assign(instance, {
        name,
        method: (method: string, handler: (p: unknown, c: CallContext) => unknown) =>
          methods.set(method, handler),
        getPlugin: <T,>(ctor: new () => T): T => {
          const found = this.instances.get(ctor);
          if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
          return found as T;
        },
        log: this.log,
      });
      this.classes.set(name, Ctor);
      this.instances.set(Ctor, instance);
      this.expose();
      for (const declared of instance.__declared ?? []) {
        methods.set(declared.name, declared.method);
      }
      await instance.activate();
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
      },
      dir,
      manifest,
      clientCode,
      methods,
    });
    this.log.info(`плагин ${name}@${manifest.version} готов`);
  }
}
