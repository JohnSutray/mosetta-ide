import * as preact from 'preact';
import * as hooks from 'preact/hooks';
import * as signals from '@preact/signals';
import * as jsxRuntime from 'preact/jsx-runtime';
import { signal } from '@preact/signals';
import type { PluginInfo } from '@ide/protocol';
import { complain, rpc, say } from './session.js';
import { registerPluginCommand } from '../keys/commands.js';
import {
  activate as activateHook,
  attach,
  hooksOf,
  remote,
  stub,
  type ClientSurface,
  type Found,
  type Ide,
  type PluginClass,
  type PluginToolbarEntry,
} from '@ide/api/client';
import { addStrings } from '../i18n/index.js';
export type { PluginToolbarEntry } from '@ide/api/client';

export const pluginList = signal<PluginInfo[]>([]);
export const pluginToolbar = signal<PluginToolbarEntry[]>([]);
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
    api: { ...surface, remote, stub, activate: activateHook },
    plugins: pluginClasses,
  };
}

export async function loadPlugins(surface: ClientSurface): Promise<void> {
  expose(surface);
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
    addStrings(info.name, info.strings);
    if (!info.hasClient) continue;
    try {
      await start(info);
    } catch (err) {
      complain(`${info.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function start(info: PluginInfo): Promise<void> {
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
    await hooksOf(instance).start?.();
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
      registerPluginCommand(id, run);
    },
    toolbar(entry: PluginToolbarEntry) {
      pluginToolbar.value = [...pluginToolbar.value, entry];
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
    say,
  };
}
