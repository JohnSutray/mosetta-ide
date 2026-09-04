import { commands } from '../keys/commands.js';
import { rpc as socket, type RpcLike } from './session.js';
import { complain, notify, say, settle } from './notifications.js';
import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import * as signals from '@preact/signals';
import * as windows from '@ide/windows';
import * as code from '@ide/code';
import * as jsxRuntime from 'preact/jsx-runtime';
import * as cm from '@codemirror/state';
import * as cmView from '@codemirror/view';
import * as cmCommands from '@codemirror/commands';
import * as cmLanguage from '@codemirror/language';
import * as cmSearch from '@codemirror/search';
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
  type Found,
  type Ide,
  type PluginClass,
  type RegistryHandle,
} from '@ide/api/client';
import { persisted } from './persist.js';
import type { Registry } from './registry.js';
import { i18n } from '../i18n/index.js';

interface Built {
  name: string;
  ctor: PluginClass;
  instance: object;
}

const SLOTS: Record<string, string> = { '@ide/ui': 'ui' };

export class Plugins {
  constructor(private readonly rpc: RpcLike = socket) {}

  readonly list = signal<PluginInfo[]>([]);
  readonly surfaces = signal<Array<() => unknown>>([]);

  private readonly classes = new Map<string, unknown>();

  private readonly openers = new Map<string, (found: Found) => void>();

  private readonly instances = new Map<unknown, unknown>();

  opener(kind: string) {
    return this.openers.get(kind);
  }

  private expose(surface: ClientSurface): void {
    (globalThis as Record<string, unknown>).__ideApi = {
      preact: {
        h: preact.h,
        jsx: preact.h,
        Fragment: preact.Fragment,
        createElement: preact.createElement,
        render: preact.render,
        cloneElement: preact.cloneElement,
      },
      jsx: jsxRuntime,
      hooks,
      signals,
      windows,
      code,
      cm,
      cmView,
      cmCommands,
      cmLanguage,
      cmSearch,
      api: { ...surface, remote, stub, activate: activateHook, registry: registryHook },
      plugins: this.classes,
    };
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
      if (info.provides) {
        const slot = SLOTS[info.provides];
        if (!slot) throw new Error(`не знаю, куда класть ${info.provides}`);
        (globalThis as unknown as { __ideApi: Record<string, unknown> }).__ideApi[slot] = mod;
      }
      const Ctor = mod.default;
      if (typeof Ctor !== 'function') {
        throw new Error('нет export default class');
      }

      const ide = this.services(info.name);
      const instance = new Ctor(ide) as object;
      attach(instance, ide);

      this.classes.set(info.name, Ctor);
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
      remember<T>(key: string, initial: T): Signal<T> {
        return persisted(`${name}/${key}`, initial);
      },

      css(text: string) {
        const tag = document.createElement('style');
        tag.dataset.plugin = name;
        tag.textContent = text;
        document.head.append(tag);
      },
      open: (kind: string, handler: (found: Found) => void) => {
        this.openers.set(kind, handler);
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
