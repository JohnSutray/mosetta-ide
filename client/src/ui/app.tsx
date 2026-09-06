import { keyContexts } from '../keys/context.js';
import { commands } from '../keys/commands.js';
import { keysEcho } from '../keys/echo.js';
import { reserved } from '../keys/reserved.js';
import { editorFocus } from '../state/editor.js';
import { computed } from '@preact/signals';
import { keyHost } from '../keys/host.js';
import { config } from '../state/config.js';
import { complain } from '../state/notifications.js';
import { doc, lsp, rpc, session } from '../state/session.js';
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
import { goTo } from './go-to.js';
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
      problems: lsp.problems,
      goTo,
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
        roots: () => rpc.call('workspace.roots', null),
        recent: () => rpc.call('workspace.recent', null),
        browse: (prefix, options) => rpc.call('workspace.browse', { prefix, ...options }),
      },
      merge: {
        state: () => rpc.call('merge.state', null),
        resolve: (path, text) => rpc.call('merge.resolve', { path, text }),
        cancel: async () => {
          await rpc.call('merge.cancel', null);
        },
        fromDisk: (path) => doc.mergeFromDisk(path),
        onState: (handler) => rpc.on('merge.state', handler),
        onRequested: (handler) => doc.onMergeRequested(handler),
        expectExternal: (path) => doc.expectExternal(path),
        forgetDiverged: (path) => doc.forgetDiverged(path),
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
        reveal: async (path) => {
          await rpc.call('fs.reveal', { path });
        },
      },
      openFile: (path, options) => {
        if (options?.focus === false) editorFocus.openWithoutFocus();
        const opened = doc.openAt(path);
        if (options?.focus) void opened.then(() => editorFocus.focus());
        return opened;
      },
      flushDocs: () => doc.sync.flush(),
      setSetting: async (section, key, value) => {
        await rpc.call('config.set', { section, key, value });
      },
      primaryHeld: (event) => keyHost.primaryHeld(event),
      openDoc: doc.open,
      diverged: doc.diverged,
      reloadFile: () => doc.reload(),
      editDoc: (text) => doc.edit(text),
      closeFile: () => doc.close(),
      dirty: doc.dirty,
      fileDiagnostics: doc.diagnostics,
      externalEpoch: doc.externalEpoch,
      pendingReveal: doc.pendingReveal,
      hover: (path, line, character) => rpc.call('lsp.hover', { path, line, character }),
      definition: (path, line, character) => rpc.call('lsp.definition', { path, line, character }),
      references: (path, line, character) => rpc.call('lsp.references', { path, line, character }),
      peekFile: async (path) => {
        const state = await rpc.call('doc.state', { path });
        return { path: state.path, text: state.text };
      },
      searchIndex: (query, limit, kinds) => rpc.call('index.search', { query, limit, kinds }),
      openerFor: (kind) => plugins.opener(kind),
      takeFocusOnMount: () => editorFocus.takeOnMount(),
      wantsFocus: editorFocus.wanted,
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

  useEffect(() => {
    document.title = doc.title.value;
  }, [doc.title.value]);

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
