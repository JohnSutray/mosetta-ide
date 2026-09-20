import { render } from 'preact';
import { effect } from '@preact/signals';
import {
  inLayerOrder,
  PROJECT_LAYER,
  SETTINGS_SCHEMA,
  settingsKey,
  USER_LAYER,
  type IdeServices,
  type SettingsEntry,
} from '@mosetta/ide-api/client';
import { overlay } from '@mosetta/ide-api/section';
import { SettingsLayers } from './state/settings-layers.js';
import { SettingsWrite } from './state/settings-write.js';
import { RpcClient } from './rpc/client.js';
import { Notifications } from './state/notifications.js';
import { Config } from './state/config.js';
import { I18n } from './i18n/index.js';
import { Startup } from './state/startup.js';
import { Memory } from './state/persist.js';
import { Commands } from './keys/commands.js';
import { Session } from './state/session.js';
import { Registry } from './state/registry.js';
import { Plugins } from './state/plugins.js';
import { RootMount, type MountOptions } from './state/mount.js';
import { FS_SCHEMA, UI_SCHEMA, legacyNames } from '@mosetta/ide-protocol';
import { App } from './ui/app.js';

/**
 * The tab's root: the owner of everything the client core has exactly one of.
 *
 * The wire, the session, the config, the voice, the dictionary, the memory, the
 * windows, the commands, the registry and the plugins' home used to be module-level
 * `export const x = new X()` with a note saying "the IDE's root object will own this
 * one day". Now there is an owner: everything is created HERE, the connections are
 * constructor arguments, and the order of the fields is the order things come up in.
 * Two IDEs in one tab means two `new Core()`, with nothing to share.
 */
export class Core {
  readonly rpc = new RpcClient();
  readonly notifications = new Notifications();
  readonly config = new Config();
  readonly i18n = new I18n();
  /** The tab's first half-second: the splash instead of "nobody to draw this". */
  readonly startup = new Startup();
  readonly memory = new Memory();
  readonly commands = new Commands();
  readonly session = new Session(this.rpc, this.config, this.notifications, this.i18n);
  /** The shared store of declarations: the core writes its own, the plugins theirs. */
  readonly store = new Registry((message) => this.notifications.complain(message));
  readonly plugins = new Plugins(this.rpc, {
    commands: this.commands,
    notes: this.notifications,
    memory: this.memory,
    i18n: this.i18n,
  });
  /** Where the IDE is mounted: the root, its size, and where to listen for events. */
  readonly mount: RootMount;
  /**
   * Whether the core's own `fs` section has already been declared in the settings
   * registry.
   */
  private coreDeclared = false;
  /** The settings layers, in the sections' registry keys. */
  private readonly layers = new SettingsLayers(this.store, (message) => this.notifications.complain(message));
  /** Whether a setting may be written: the declaration plus the section's schema. */
  private readonly writes = new SettingsWrite(this.store);
  /** The core's services for plugins: as fields on `ide`, and as context for markup. */
  readonly services: IdeServices;

  /**
   * The root and the mode arrive from whoever mounts it: a whole page, or an element
   * inside somebody else's page.
   */
  constructor(
    private readonly root: HTMLElement,
    options: MountOptions,
  ) {
    this.memory.migrate((key) => {
      const at = key.indexOf('/', key.indexOf('/') + 1);
      if (at < 0) return null;
      const name = legacyNames.currentOf(key.slice(0, at));
      return name === null ? null : name + key.slice(at);
    });
    this.mount = new RootMount(root, options);
    this.services = this.serve();
    this.session.onConfigChanged(() => this.applyLayers());
    this.store.declare('chrome.top', 'core');
    this.store.declare('chrome.main', 'core');
    this.store.declare('settings', 'core', SETTINGS_SCHEMA);
    effect(() => {
      const core = this.config.defaults.value;
      if (!core || this.coreDeclared) return;
      this.coreDeclared = true;
      this.store.add<SettingsEntry>(
        'settings',
        { section: 'fs', defaults: core.fs, schema: FS_SCHEMA, owner: 'core', title: 'settings.core' },
        'core',
      );
      this.store.declare(settingsKey('fs'), 'core', FS_SCHEMA);
      this.store.add(settingsKey('fs'), core.fs, 'core');
      this.store.add<SettingsEntry>(
        'settings',
        {
          section: 'ui',
          defaults: core.ui,
          schema: UI_SCHEMA,
          owner: 'core',
          title: 'settings.core',
          fields: { locale: { options: this.i18n.available() } },
        },
        'core',
      );
      this.store.declare(settingsKey('ui'), 'core', UI_SCHEMA);
      this.store.add(settingsKey('ui'), core.ui, 'core');
    });

    effect(() => {
      const chosen = this.config.settings.value?.ui?.locale;
      this.i18n.use(typeof chosen === 'string' && chosen !== '' ? chosen : 'en');
    });
  }

  /**
   * Lay the config that arrived out into the sections' keys.
   *
   * Called from the event handler rather than from an effect on a signal: an effect
   * that writes signals risks subscribing to what it changes itself. Here the flow is
   * one-way — file, server, event, registry.
   */
  applyLayers(): void {
    this.layers.apply(USER_LAYER, this.config.user.value);
    this.layers.apply(PROJECT_LAYER, this.config.project.value);
  }

  /** Bring the tab up: the network, the frame, then the plugins. */
  start(): void {
    this.rpc.connect();
    this.startup.begin();
    render(<App core={this} />, this.root);
    void this.plugins.load(this.services, this.store);
  }

  /**
   * What is handed to plugins is listed HERE. The type annotation is not decoration:
   * `IdeServices` is declared in the contract, so a mismatch is caught by an error
   * right here rather than as "the plugin has the wrong type".
   */
  private serve(): IdeServices {
    const store = this.store;
    const plugins = this.plugins;
    return {
      t: (key, params) => this.i18n.t(key, params),
      runCommand: (id) => this.commands.run(id),
      knownCommands: {
        get value() {
          return [...plugins.commands.value].sort((a, b) => a.id.localeCompare(b.id));
        },
      },
      connected: this.session.connected,
      daemon: this.session.daemon,
      notes: {
        all: this.notifications.notes,
        notify: (text, kind) => this.notifications.notify(text, kind),
        settle: (id, text, kind) => this.notifications.settle(id, text, kind),
        dismiss: (id) => this.notifications.dismiss(id),
        dismissAll: () => this.notifications.dismissAll(),
      },
      settings: this.config.settings,
      settingsOf: (section, defaults) => {
        const layers = store.entries<object>(settingsKey(section));
        return {
          get value() {
            return inLayerOrder(layers.value).reduce<typeof defaults>((acc, one) => overlay(acc, one.value), defaults);
          },
        };
      },
      project: this.session.attached,
      workspaces: {
        current: this.session.current,
        live: this.session.workspaces,
        open: (root) => this.session.openProject(root),
        switchTo: (id) => this.session.switchProject(id),
      },
      tree: {
        list: (path) => this.rpc.call('tree.list', { path }),
        onChanged: (handler) => this.rpc.on('tree.changed', handler),
      },
      fs: {
        create: (path, kind) => this.rpc.call('fs.create', { path, kind }),
        move: (from, to) => this.rpc.call('fs.move', { from, to }),
        copy: (from, to) => this.rpc.call('fs.copy', { from, to }),
        remove: async (path) => {
          await this.rpc.call('fs.remove', { path });
        },
        write: async (path, text) => {
          await this.rpc.call('fs.write', { path, text });
        },
        writeBytes: (path, base64) => this.rpc.call('fs.writeBytes', { path, base64 }),
        bytes: (path, limit) => this.rpc.call('fs.bytes', limit === undefined ? { path } : { path, limit }),
        absolute: async (path) => (await this.rpc.call('fs.absolute', { path })).path,
      },
      docs: {
        open: (path) => this.rpc.call('doc.open', { path }),
        close: async (path) => {
          await this.rpc.call('doc.close', { path });
        },
        edit: (path, text, baseVersion) => this.rpc.call('doc.edit', { path, text, baseVersion }),
        save: (path) => this.rpc.call('doc.save', { path }),
        reload: (path) => this.rpc.call('doc.reload', { path }),
        state: (path) => this.rpc.call('doc.state', { path }),
        unsaved: async () => (await this.rpc.call('doc.unsaved', null)).paths,
        onChanged: (handler) => this.rpc.on('doc.changed', handler),
        onExternal: (handler) => this.rpc.on('doc.external', handler),
        onDiverged: (handler) => this.rpc.on('doc.diverged', handler),
        onMoved: (handler) => this.rpc.on('doc.moved', handler),
        onRemoved: (handler) => this.rpc.on('doc.removed', handler),
      },
      mount: this.mount,
      projectPath: this.config.projectFile,
      resetSetting: async (section, key) => {
        await this.rpc.call('config.reset', { section, key });
      },
      setSetting: async (section, key, value, scope) => {
        const no = this.writes.complain(section, key, value, scope === 'project' ? PROJECT_LAYER : USER_LAYER);
        if (no) throw new Error(no);
        await this.rpc.call('config.set', { section, key, value, scope });
      },
    };
  }
}
