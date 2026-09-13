import { render } from 'preact';
import { effect } from '@preact/signals';
import { SETTINGS_SCHEMA, type IdeServices, type SettingsEntry } from '@mosetta/ide-api/client';
import { sectionOf } from '@mosetta/ide-api/section';
import { RpcClient } from './rpc/client.js';
import { Notifications } from './state/notifications.js';
import { Config } from './state/config.js';
import { I18n } from './i18n/index.js';
import { Memory } from './state/persist.js';
import { Commands } from './keys/commands.js';
import { Session } from './state/session.js';
import { Registry } from './state/registry.js';
import { Plugins } from './state/plugins.js';
import { RootMount, type MountOptions } from './state/mount.js';
import { legacyNames } from '@mosetta/ide-protocol';
import { App } from './ui/app.js';

export class Core {
  readonly rpc = new RpcClient();
  readonly notifications = new Notifications();
  readonly config = new Config();
  readonly i18n = new I18n();
  readonly memory = new Memory();
  readonly commands = new Commands();
  readonly session = new Session(this.rpc, this.config, this.notifications, this.i18n);
  readonly store = new Registry((message) => this.notifications.complain(message));
  readonly plugins = new Plugins(this.rpc, {
    commands: this.commands,
    notes: this.notifications,
    memory: this.memory,
    i18n: this.i18n,
  });
  readonly mount: RootMount;
  private coreDeclared = false;
  readonly services: IdeServices;

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
    this.store.declare('chrome.top', 'core');
    this.store.declare('chrome.main', 'core');
    this.store.declare('settings', 'core', SETTINGS_SCHEMA);
    effect(() => {
      const core = this.config.defaults.value;
      if (!core || this.coreDeclared) return;
      this.coreDeclared = true;
      this.store.add<SettingsEntry>('settings', { section: 'fs', defaults: core.fs, owner: 'core', title: 'settings.core' }, 'core');
    });
  }

  start(): void {
    this.rpc.connect();
    render(<App core={this} />, this.root);
    void this.plugins.load(this.services, this.store).then(() => {
      const dead = this.commands.missing();
      if (dead.length) console.warn('[web-ide] команды без реализации:', dead.join(', '));
    });
  }

  private serve(): IdeServices {
    const config = this.config;
    return {
      t: (key, params) => this.i18n.t(key, params),
      runCommand: (id) => this.commands.run(id),
      keymap: this.config.keymap,
      connected: this.session.connected,
      notes: {
        all: this.notifications.notes,
        notify: (text, kind) => this.notifications.notify(text, kind),
        settle: (id, text, kind) => this.notifications.settle(id, text, kind),
        dismiss: (id) => this.notifications.dismiss(id),
        dismissAll: () => this.notifications.dismissAll(),
      },
      settings: this.config.settings,
      settingsOf: (section, defaults) => ({
        get value() {
          return sectionOf(config.settings.value, section, defaults);
        },
      }),
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
        onChanged: (handler) => this.rpc.on('doc.changed', handler),
        onExternal: (handler) => this.rpc.on('doc.external', handler),
        onDiverged: (handler) => this.rpc.on('doc.diverged', handler),
        onMoved: (handler) => this.rpc.on('doc.moved', handler),
        onRemoved: (handler) => this.rpc.on('doc.removed', handler),
      },
      mount: this.mount,
      settingsFile: this.config.user,
      projectFile: this.config.project,
      projectPath: this.config.projectFile,
      resetSetting: async (section, key) => {
        await this.rpc.call('config.reset', { section, key });
      },
      setSetting: async (section, key, value, scope) => {
        const own = this.store.all<SettingsEntry>('settings').value.find((one) => one.section === section);
        if (!own) throw new Error(`раздел настроек никто не объявил: ${section}`);
        const known = (own.defaults as Record<string, unknown>)[key];
        if (known === undefined) throw new Error(`такой настройки нет: ${section}.${key}`);
        if (typeof known !== typeof value) throw new Error(`${section}.${key} ждёт ${typeof known}`);
        const options = own.fields?.[key]?.options;
        if (options && typeof value === 'string' && !options.includes(value)) {
          throw new Error(`${section}.${key}: «${value}» — не из вариантов ${options.join(', ')}`);
        }
        await this.rpc.call('config.set', { section, key, value, scope });
      },
    };
  }
}
