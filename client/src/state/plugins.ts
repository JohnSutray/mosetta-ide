import { commands } from '../keys/commands.js';
import { rpc } from './session.js';
import { complain, say } from './notifications.js';
import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import * as signals from '@preact/signals';
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

export const pluginList = signal<PluginInfo[]>([]);
export const pluginSurfaces = signal<Array<() => unknown>>([]);

const pluginClasses = new Map<string, unknown>();

const openers = new Map<string, (found: Found) => void>();

const instances = new Map<unknown, unknown>();

export function pluginOpener(kind: string) {
  return openers.get(kind);
}

function expose(surface: ClientSurface): void {
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
    cm,
    cmView,
    cmCommands,
    cmLanguage,
    cmSearch,
    api: { ...surface, remote, stub, activate: activateHook, registry: registryHook },
    plugins: pluginClasses,
  };
}

export async function loadPlugins(surface: ClientSurface, registry: Registry): Promise<void> {
  expose(surface);
  store = registry;
  const built: Built[] = [];
  let list: PluginInfo[];
  try {
    list = await rpc.call('plugins.list', null);
  } catch {
    return;
  }
  pluginList.value = list;

  for (const info of list) {
    if (info.state !== 'ok') {
      complain(`${info.name}: ${info.error ?? 'не поднялся'}`);
      continue;
    }
    i18n.add(info.name, info.strings);
    if (!info.hasClient) continue;
    try {
      built.push(await build(info));
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

let store: Registry | null = null;

function registryOf(): Registry {
  if (!store) throw new Error('реестр не поднят: плагины загружены мимо loadPlugins');
  return store;
}

interface Built {
  name: string;
  ctor: PluginClass;
  instance: object;
}

async function build(info: PluginInfo): Promise<Built> {
  const { code } = await rpc.call('plugins.code', { name: info.name });
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const mod = (await import(/* @vite-ignore */ url)) as { default?: PluginClass };
    const Ctor = mod.default;
    if (typeof Ctor !== 'function') {
      throw new Error('нет export default class');
    }

    const ide = servicesFor(info.name);
    const instance = new Ctor(ide) as object;
    attach(instance, ide);

    pluginClasses.set(info.name, Ctor);
    instances.set(Ctor, instance);
    return { name: info.name, ctor: Ctor, instance };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function servicesFor(name: string): Ide {
  return {
    name,
    rpc: {
      call: (method: string, params: unknown) =>
        rpc.call('plugins.call', { name, method, params }),
    },
    command(id: string, run: () => void) {
      commands.registerPlugin(id, run);
    },
    registry<T>(key: string): RegistryHandle<T> {
      const store_ = registryOf();
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
    open(kind: string, handler: (found: Found) => void) {
      openers.set(kind, handler);
    },
    getPlugin<T>(ctor: PluginClass<T>): T {
      const found = instances.get(ctor);
      if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
      return found as T;
    },
    surface(view: () => unknown) {
      pluginSurfaces.value = [...pluginSurfaces.value, view];
    },
    say: (message: string) => say(message),
  };
}
