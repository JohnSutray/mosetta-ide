import type { Commands } from '../keys/commands.js';
import type { RpcLike } from './session.js';
import type { Notifications } from './notifications.js';
import { signal, type Signal } from '@preact/signals';
import type { PluginInfo } from '@mosetta/ide-protocol';
import {
  activate as activateHook,
  attach,
  command as commandHook,
  commandsOf,
  hooksOf,
  registriesOf,
  sectionsOf,
  settingsKey,
  inLayerOrder,
  USER_LAYER,
  PROJECT_LAYER,
  configSection,
  passportOf,
  plugin as pluginHook,
  registry as registryHook,
  remote,
  stub,
  IdeProvider,
  useIde,
  useT,
  type IdeServices,
  type Ide,
  type PluginClass,
  type RegistryHandle,
} from '@mosetta/ide-api/client';
import type { Memory } from './persist.js';
import { sharedModules } from './shared-modules.js';
import type { Registry } from './registry.js';
import type { I18n } from '../i18n/index.js';

export interface PluginDeps {
  commands: Pick<Commands, 'registerPlugin'>;
  notes: Pick<Notifications, 'say' | 'complain' | 'notify' | 'settle'>;
  memory: Pick<Memory, 'signal'>;
  i18n: Pick<I18n, 'add' | 'defaults'>;
}

interface Built {
  name: string;
  ctor: PluginClass;
  instance: object;
}

export class Plugins {
  constructor(
    private readonly rpc: RpcLike,
    private readonly deps: PluginDeps,
  ) {}

  readonly list = signal<PluginInfo[]>([]);
  readonly commands = signal<Array<{ id: string }>>([]);
  readonly surfaces = signal<Array<() => unknown>>([]);

  private readonly instances = new Map<unknown, unknown>();
  private readonly slots = new Map<string, number>();

  private expose(): void {
    (globalThis as Record<string, unknown>).__ideApi = {
      modules: {
        ...sharedModules,
        '@mosetta/ide-api/client': {
          IdeProvider,
          useIde,
          useT,
          remote,
          stub,
          activate: activateHook,
          command: commandHook,
          registry: registryHook,
          configSection,
          plugin: pluginHook,
          settingsKey,
          USER_LAYER,
          PROJECT_LAYER,
          inLayerOrder,
        },
      },
    };
  }

  private serve(name: string, mod: unknown): void {
    (globalThis as unknown as { __ideApi: { modules: Record<string, unknown> } }).__ideApi.modules[name] = mod;
  }

  async load(surface: IdeServices, registry: Registry): Promise<void> {
    this.expose();
    this.shared = surface;
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
        this.deps.notes.complain(`${info.name}: ${info.error ?? 'не поднялся'}`);
        continue;
      }
      this.deps.i18n.add(info.name, info.strings);
      if (!info.hasClient) continue;
      try {
        built.push(await this.build(info));
      } catch (err) {
        this.deps.notes.complain(`${info.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const one of built) {
      for (const spec of registriesOf(one.ctor)) registry.declare(spec.key, one.name, spec.schema);
      const passport = passportOf(one.ctor);
      const title = passport?.title;
      if (!title) this.deps.notes.complain(`${one.name}: у плагина нет названия — @plugin({ title }) (ADR-0213)`);
      if (passport?.strings) this.deps.i18n.defaults(passport.strings);
      for (const spec of sectionsOf(one.ctor)) {
        registry.add('settings', { ...spec, owner: one.name, title: title ?? one.name }, one.name);
        registry.declare(settingsKey(spec.section), one.name, spec.schema);
        registry.add(settingsKey(spec.section), spec.defaults, one.name);
      }
    }
    const declared: Array<{ id: string }> = [];
    for (const one of built) {
      for (const cmd of commandsOf(one.instance)) {
        this.deps.commands.registerPlugin(cmd.id, cmd.run as () => void);
        declared.push({ id: cmd.id });
      }
    }
    this.commands.value = declared;

    for (const one of built) {
      try {
        await hooksOf(one.instance).start?.();
      } catch (err) {
        this.deps.notes.complain(`${one.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private shared: IdeServices | null = null;

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
    if (!this.shared) throw new Error('службы не поданы: плагины загружены мимо plugins.load');
    return { ...this.shared, ...this.bound(name) };
  }

  bound(name: string): Omit<Ide, keyof IdeServices> {
    return {
      name,
      rpc: {
        call: (method: string, params: unknown) =>
          this.rpc.call('plugins.call', { name, method, params }),
      },
      command: (id: string, run: () => void) => {
        this.deps.commands.registerPlugin(id, run);
      },
      registry: <T,>(key: string): RegistryHandle<T> => {
        const store_ = this.registryOf();
        return {
          add: (value: T) => store_.add(key, value, name),
          get all() {
            return store_.all<T>(key);
          },
          get entries() {
            return store_.entries<T>(key);
          },
        };
      },
      remember: <T,>(key: string, initial: T, scope: 'tab' | 'both' = 'both'): Signal<T> =>
        this.deps.memory.signal(`${name}/${key}`, initial, scope),

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
      say: (message: string) => this.deps.notes.say(message),
      complain: (message: string) => this.deps.notes.complain(message),
      sayOnce: (slot: string, message: string) => {
        this.slots.set(slot, this.deps.notes.settle(this.slots.get(slot) ?? 0, message));
      },
      working: (text: string) => {
        const note = this.deps.notes.notify(text, 'work');
        return (done: string, failed = false) => {
          this.deps.notes.settle(note, done, failed ? 'error' : 'info');
        };
      },
    };
  }
}
