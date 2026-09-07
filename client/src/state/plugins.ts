import { commands } from '../keys/commands.js';
import { rpc as socket, type RpcLike } from './session.js';
import { complain, notify, say, settle } from './notifications.js';
import { signal, type Signal } from '@preact/signals';
import type { PluginInfo } from '@ide/protocol';
import {
  activate as activateHook,
  attach,
  hooksOf,
  registriesOf,
  registry as registryHook,
  remote,
  stub,
  type ClientSurface,
  type Ide,
  type PluginClass,
  type RegistryHandle,
} from '@ide/api/client';
import { persisted } from './persist.js';
import { sharedModules } from './shared-modules.js';
import type { Registry } from './registry.js';
import { i18n } from '../i18n/index.js';

interface Built {
  name: string;
  ctor: PluginClass;
  instance: object;
}

export class Plugins {
  constructor(private readonly rpc: RpcLike = socket) {}

  readonly list = signal<PluginInfo[]>([]);
  readonly surfaces = signal<Array<() => unknown>>([]);

  private readonly instances = new Map<unknown, unknown>();
  private readonly slots = new Map<string, number>();

  private expose(surface: ClientSurface): void {
    (globalThis as Record<string, unknown>).__ideApi = {
      modules: {
        ...sharedModules,
        '@ide/api/client': { ...surface, remote, stub, activate: activateHook, registry: registryHook },
      },
    };
  }

  private serve(name: string, mod: unknown): void {
    (globalThis as unknown as { __ideApi: { modules: Record<string, unknown> } }).__ideApi.modules[name] = mod;
  }

  async load(surface: ClientSurface, registry: Registry): Promise<void> {
    this.expose(surface);
    this.store = registry;
    const built: Built[] = [];
    let list: PluginInfo[];
    try {
      list = await this.rpc.call('plugins.list', null);
    } catch {
      return;
    }
    this.list.value = list;

    for (const info of list) {
      if (info.state !== 'ok') {
        complain(`${info.name}: ${info.error ?? 'не поднялся'}`);
        continue;
      }
      i18n.add(info.name, info.strings);
      if (!info.hasClient) continue;
      try {
        built.push(await this.build(info));
      } catch (err) {
        complain(`${info.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const one of built) {
      for (const spec of registriesOf(one.ctor)) registry.declare(spec.key, one.name, spec.schema);
    }
    for (const one of built) {
      try {
        await hooksOf(one.instance).start?.();
      } catch (err) {
        complain(`${one.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private store: Registry | null = null;

  private registryOf(): Registry {
    if (!this.store) throw new Error('реестр не поднят: плагины загружены мимо plugins.load');
    return this.store;
  }

  private async build(info: PluginInfo): Promise<Built> {
    const { code } = await this.rpc.call('plugins.code', { name: info.name });
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      const mod = (await import(/* @vite-ignore */ url)) as { default?: PluginClass };
      this.serve(info.name, mod);
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') {
        throw new Error('нет export default class');
      }

      const ide = this.services(info.name);
      const instance = new Ctor(ide) as object;
      attach(instance, ide);

      this.instances.set(Ctor, instance);
      return { name: info.name, ctor: Ctor, instance };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  services(name: string): Ide {
    return {
      name,
      rpc: {
        call: (method: string, params: unknown) =>
          this.rpc.call('plugins.call', { name, method, params }),
      },
      command(id: string, run: () => void) {
        commands.registerPlugin(id, run);
      },
      registry: <T,>(key: string): RegistryHandle<T> => {
        const store_ = this.registryOf();
        return {
          add: (value: T) => store_.add(key, value, name),
          get all() {
            return store_.all<T>(key);
          },
        };
      },
      remember<T>(key: string, initial: T, scope: 'tab' | 'both' = 'both'): Signal<T> {
        return persisted(`${name}/${key}`, initial, scope);
      },

      css(text: string) {
        const tag = document.createElement('style');
        tag.dataset.plugin = name;
        tag.textContent = text;
        document.head.append(tag);
      },
      on: (event: string, handler: (payload: unknown) => void) =>
        this.rpc.on('plugins.event', (frame) => {
          if (frame.name !== name || frame.event !== event) return;
          handler(frame.payload);
        }),
      getPlugin: <T,>(ctor: PluginClass<T>): T => {
        const found = this.instances.get(ctor);
        if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
        return found as T;
      },
      surface: (view: () => unknown) => {
        this.surfaces.value = [...this.surfaces.value, view];
      },
      say: (message: string) => say(message),
      complain: (message: string) => complain(message),
      sayOnce: (slot: string, message: string) => {
        this.slots.set(slot, settle(this.slots.get(slot) ?? 0, message));
      },
      working: (text: string) => {
        const note = notify(text, 'work');
        return (done: string, failed = false) => {
          settle(note, done, failed ? 'error' : 'info');
        };
      },
    };
  }
}

export const plugins = new Plugins();
