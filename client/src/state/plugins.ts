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
import { CssScope } from './css-scope.js';
import { ROOT_CLASS } from './mount.js';
import type { Registry } from './registry.js';
import type { I18n } from '../i18n/index.js';

/**
 * What the plugins' home takes from the tab's root: commands, the voice, memory, the
 * dictionary.
 */
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
  /**
   * The socket arrives through the CONSTRUCTOR.
   *
   * Not for elegance: otherwise a test cannot slip its own event in, and unpacking the
   * `plugins.event` envelope is the one place where the core decides whose event this
   * is — getting it wrong there means handing over somebody else's.
   */
  constructor(
    private readonly rpc: RpcLike,
    private readonly deps: PluginDeps,
  ) {}

  readonly list = signal<PluginInfo[]>([]);
  /**
   * The commands declared by annotations on the plugins that came up. This is where the
   * command list in the keymap editor takes them from: a package manifest no longer
   * knows anything about commands.
   */
  readonly commands = signal<Array<{ id: string }>>([]);
  readonly surfaces = signal<Array<() => unknown>>([]);

  /**
   * The live plugins, by their class. The key is the constructor itself, so
   * `getPlugin(NpmScripts)` finds the instance without string names, and the type is
   * inferred from the same object.
   */
  private readonly instances = new Map<unknown, unknown>();
  /** Moves every rule of a plugin's stylesheet under the IDE's root. */
  private readonly scope = new CssScope(`.${ROOT_CLASS}`);
  /** One line per slot: a note's id, by the slot's name. */
  private readonly slots = new Map<string, number>();

  /**
   * What the application hands outwards. The list is closed — that is precisely what
   * makes it a contract.
   *
   * Our components arrive as a PARAMETER rather than by import: state must not know
   * about the interface. An import from here into the UI closed a circle through the
   * panel layout, and the panel registry turned out empty at the moment of reading — a
   * rare breakage that only a test catches, and that looks to the eye like "panels of
   * zero width".
   */
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

  /** Put a plugin that came up onto the shared table under its own name. */
  private serve(name: string, mod: unknown): void {
    (globalThis as unknown as { __ideApi: { modules: Record<string, unknown> } }).__ideApi.modules[name] = mod;
  }

  /**
   * Bring the plugins up: ask for the list, fetch the code, activate.
   *
   * ONE of them failing does not stop the others. A plugin that brings the editor down
   * is exactly what other plugin systems get scolded for; here a crash is visible as a
   * line and goes no further.
   */
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
        this.deps.notes.complain(`${info.name}: ${info.error ?? 'did not come up'}`);
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
      if (!title) this.deps.notes.complain(`${one.name}: the plugin has no title — @plugin({ title })`);
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

  /** The core services shared by every plugin: they arrive from the frame. */
  private shared: IdeServices | null = null;

  /** The store of declarations: it arrives from the frame and lives just as long. */
  private store: Registry | null = null;

  private registryOf(): Registry {
    if (!this.store) throw new Error('the registry is not up: the plugins were loaded past plugins.load');
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
        throw new Error('no export default class');
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

  /**
   * What a plugin receives through its constructor. Everything BOUND to it is here:
   * calls leave into its namespace, and there is nowhere for two plugins to collide.
   */
  services(name: string): Ide {
    if (!this.shared) throw new Error('the services were not supplied: the plugins were loaded past plugins.load');
    return { ...this.shared, ...this.bound(name) };
  }

  /** What is bound to a plugin: calls, memory, commands, events — all in its namespace. */
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
      /**
       * A plugin's memory across reloads.
       *
       * The core does not know WHAT it remembers: whether a panel is open, which tab is
       * selected, whether a section is collapsed. What used to stand here was a
       * `panel()` that set up the memory, the command and a registry entry all at once
       * — that is, the core knew the word "panel", although a panel is a concept
       * belonging to the layout plugin.
       *
       * The key is partitioned BY PLUGIN: two plugins are entitled to name their state
       * alike, and they must not silently share a cell. As a bonus, nobody's state can
       * collide with ours.
       */
      remember: <T,>(key: string, initial: T, scope: 'tab' | 'both' = 'both'): Signal<T> =>
        this.deps.memory.signal(`${name}/${key}`, initial, scope),

      /**
       * Your own styles in one piece. The tag is marked with the plugin's name:
       * otherwise there would be no way to answer "where does this padding come from".
       * The rules are moved under the IDE's root on the way, so that a plugin's
       * `.button` stays the IDE's business on a page the IDE is embedded in.
       */
      css: (text: string) => {
        const tag = document.createElement('style');
        tag.dataset.plugin = name;
        tag.textContent = this.scope.apply(text);
        document.head.append(tag);
      },
      /**
       * Subscribing to events from YOUR OWN server half.
       *
       * The core carries them in a single `plugins.event` envelope and does not look
       * inside: that `term.data` exists is known only to the terminal's two halves.
       * Here we filter out what is not ours — by the plugin's name and by the event's
       * name — and hand back an unsubscribe.
       */
      on: (event: string, handler: (payload: unknown) => void) =>
        this.rpc.on('plugins.event', (frame) => {
          if (frame.name !== name || frame.event !== event) return;
          handler(frame.payload);
        }),
      /**
       * Somebody else's plugin, by its class. Not "it might turn up": if a plugin
       * declared that it needs another, that other one came up first — the load order
       * is topological, and otherwise loading would not have reached this point.
       */
      getPlugin: <T,>(ctor: PluginClass<T>): T => {
        const found = this.instances.get(ctor);
        if (!found) throw new Error(`plugin not up: ${ctor.name}`);
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
