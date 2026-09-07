import { keyContexts } from '../keys/context.js';
import { commands } from '../keys/commands.js';
import { keysEcho } from '../keys/echo.js';
import { reserved } from '../keys/reserved.js';
import { computed } from '@preact/signals';
import { keyHost } from '../keys/host.js';
import { config } from '../state/config.js';
import { complain } from '../state/notifications.js';
import { rpc, session } from '../state/session.js';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { chordHeld } from '../keys/chords.js';
import { registerCommands } from '../commands.js';
import { Dispatcher } from '../keys/dispatcher.js';
import { Notifications } from './notifications.js';
import { registerToolbarWishes } from './toolbar-wishes.js';
import { Registry } from '../state/registry.js';
import { keysFor } from '../keys/keys-for.js';
import { i18n } from '../i18n/index.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import { plugins } from '../state/plugins.js';
import type { ClientSurface } from '@ide/api/client';

const store = new Registry((message) => complain(message));

store.declare('chrome.top', 'core');
store.declare('chrome.main', 'core');
registerToolbarWishes(store);

function Region({ name, fallback }: { name: string; fallback?: JSX.Element }) {
  const views = store.all<() => unknown>(name).value;
  if (views.length === 0) return fallback ?? null;
  return <>{views.map((view) => view() as JSX.Element)}</>;
}

function NoShell() {
  const loaded = plugins.list.value.map((one) => one.name);
  return (
    <div class="no-shell">
      <div class="no-shell-title">{i18n.t('shell.missing')}</div>
      <p class="no-shell-why">{i18n.t('shell.missing.why')}</p>
      <p class="no-shell-why">
        {loaded.length > 0
          ? i18n.t('shell.missing.loaded', { names: loaded.join(', ') })
          : i18n.t('shell.missing.none')}
      </p>
    </div>
  );
}

export function App() {
  useEffect(() => {
    registerCommands();
    const surface: ClientSurface = {
      t: (key, params) => i18n.t(key, params),
      runCommand: (id) => commands.run(id),
      keysFor,
      settings: config.settings,
      project: session.attached,
      keys: {
        host: keyHost.host,
        os: keyHost.os,
        bindings: computed(() => config.keymap.value.bindings),
        humanize: (key) => keyHost.humanize(key),
        taken: (scopes) => reserved.in(scopes),
        echo: keysEcho.lastKey,
      },
      workspaces: {
        current: session.current,
        live: session.workspaces,
        open: (root) => session.openProject(root),
        switchTo: (id) => session.switchProject(id),
      },
      tree: {
        list: (path) => rpc.call('tree.list', { path }),
        onChanged: (handler) => rpc.on('tree.changed', handler),
      },
      fs: {
        create: (path, kind) => rpc.call('fs.create', { path, kind }),
        move: (from, to) => rpc.call('fs.move', { from, to }),
        copy: (from, to) => rpc.call('fs.copy', { from, to }),
        remove: async (path) => {
          await rpc.call('fs.remove', { path });
        },
        write: async (path, text) => {
          await rpc.call('fs.write', { path, text });
        },
        writeBytes: (path, base64) => rpc.call('fs.writeBytes', { path, base64 }),
        absolute: async (path) => (await rpc.call('fs.absolute', { path })).path,
      },
      docs: {
        open: (path) => rpc.call('doc.open', { path }),
        close: async (path) => {
          await rpc.call('doc.close', { path });
        },
        edit: (path, text, baseVersion) => rpc.call('doc.edit', { path, text, baseVersion }),
        save: (path) => rpc.call('doc.save', { path }),
        reload: (path) => rpc.call('doc.reload', { path }),
        state: (path) => rpc.call('doc.state', { path }),
        onChanged: (handler) => rpc.on('doc.changed', handler),
        onExternal: (handler) => rpc.on('doc.external', handler),
        onDiverged: (handler) => rpc.on('doc.diverged', handler),
        onMoved: (handler) => rpc.on('doc.moved', handler),
        onRemoved: (handler) => rpc.on('doc.removed', handler),
      },
      setSetting: async (section, key, value) => {
        await rpc.call('config.set', { section, key, value });
      },
      primaryHeld: (event) => keyHost.primaryHeld(event),
      chordHeld,
    };
    void plugins.load(surface, store).then(() => {
      const dead = commands.missing();
      if (dead.length) console.warn('[web-ide] команды без реализации:', dead.join(', '));
    });
    const dispatcher = new Dispatcher(
      () => keyContexts.here(),
      (key) => keysEcho.noteUnbound(key),
    );
    dispatcher.setKeymap(config.keymap.peek());
    const stop = config.keymap.subscribe((value) => dispatcher.setKeymap(value));
    return () => {
      stop();
      dispatcher.dispose();
    };
  }, []);

  return (
    <div
      class="app"
    >
      <Region name="chrome.top" />
      <Region name="chrome.main" fallback={<NoShell />} />
      <PluginSurfaces />
      <Notifications />
    </div>
  );
}
