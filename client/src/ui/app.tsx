import { inputMechanics } from '../editor/input-keymap.js';
import { keyContexts } from '../keys/context.js';
import { treeFollow } from '../state/tree-follow.js';
import { commands } from '../keys/commands.js';
import { geometry } from '../state/layout.js';
import { keysHelp } from '../state/keys-help.js';
import { gitMarks } from '../state/git-marks.js';
import { editorFocus } from '../state/editor.js';
import { treeMenu } from '../state/tree-menu.js';
import { tips } from '../state/tip.js';
import { symbols } from '../state/symbols.js';
import { config } from '../state/config.js';
import { visits } from '../state/visits.js';
import { complain } from '../state/notifications.js';
import { doc, lsp, rpc, session } from '../state/session.js';
import { merge } from '../state/merge.js';
import { projects } from '../state/projects.js';
import { tools } from '../state/tools.js';
import { git } from '../state/git.js';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { chordHeld } from '../keys/chords.js';
import { darcula } from '../editor/darcula.js';
import { languages } from '../editor/languages.js';
import { codePainter } from '../editor/paint-line.js';
import { lineDiff } from '../editor/line-diff.js';
import { registerCommands } from '../commands.js';
import { Dispatcher } from '../keys/dispatcher.js';
import { SearchEverywhere } from './search-everywhere.js';
import { Branches } from './branches.js';
import { Notifications } from './notifications.js';
import { TreeMenu } from './tree-menu.js';
import { Prompt } from './prompt.js';
import { Push } from './push.js';
import { registerToolbarWishes } from './toolbar-wishes.js';
import { registerPanelWishes } from './panel-wishes.js';
import { Registry } from '../state/registry.js';
import { keysFor } from '../keys/keys-for.js';
import { Resizer } from './resizer.js';
import { Projects } from './projects.js';
import { i18n } from '../i18n/index.js';
import { HunkPopup } from './hunk-popup.js';
import { KeysHelp } from './keys-help.js';
import { MergeScreen } from './merge.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import { PickPopup, matches } from './pick-popup.js';
import { plugins } from '../state/plugins.js';
import { goTo } from './go-to.js';
import type { ClientSurface } from '@ide/api/client';
import { ToolPicker } from './tool-picker.js';
import { Tip } from './tip.js';
import { Symbols } from './symbols.js';

const store = new Registry((message) => complain(message));

store.declare('chrome.top', 'core');
store.declare('chrome.main', 'core');
registerToolbarWishes(store);
registerPanelWishes(store);

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
  const ws = session.current.value;
  const file = doc.open.value;

  useEffect(() => {
    registerCommands();
    const surface: ClientSurface = {
      t: (key, params) => i18n.t(key, params),
      problems: lsp.problems,
      goTo,
      runCommand: (id) => commands.run(id),
      keysFor,
      settings: config.settings,
      openDoc: doc.open,
      editDoc: (text) => doc.edit(text),
      closeFile: () => doc.close(),
      dirty: doc.dirty,
      fileDiagnostics: doc.diagnostics,
      externalEpoch: doc.externalEpoch,
      pendingReveal: doc.pendingReveal,
      headFor: (path) => gitMarks.headFor(path),
      visit: (path, line, ch) => visits.visit(path, line, ch),
      hover: (path, line, character) => rpc.call('lsp.hover', { path, line, character }),
      takeFocusOnMount: () => editorFocus.takeOnMount(),
      wantsFocus: editorFocus.wanted,
      chordHeld,
      unstable_PickPopup: PickPopup,
      unstable_highlight: (text, at) => matches.highlight(text, at),
      unstable_shiftMatches: (at, from, len) => matches.shiftMatches(at, from, len),
      unstable_showTip: (near, text, keys) => tips.show(near, text, keys),
      unstable_hideTip: () => tips.hide(),
      unstable_Resizer: Resizer,
      unstable_widthOf: (id, fallback) => geometry.widthOf(id, fallback),
      unstable_diffLines: (before, after) => lineDiff.hunks(before, after),
      unstable_showHunk: (hunk, box) => gitMarks.show(hunk, box),
      unstable_askSymbol: (where) => symbols.ask(where),
      unstable_dc: darcula.palette,
      unstable_paintCode: (text, path) => codePainter.paint(text, path),
      unstable_darcula: darcula.extension,
      unstable_textStyle: (style) => darcula.textStyle(style),
      unstable_languageFor: (path) => languages.of(path),
      unstable_inputKeymap: inputMechanics.keymap,
    };
    void plugins.load(surface, store).then(() => {
      const dead = commands.missing();
      if (dead.length) console.warn('[web-ide] команды без реализации:', dead.join(', '));
    });
    const dispatcher = new Dispatcher(
      () => keyContexts.here(),
      (key) => keysHelp.noteUnbound(key),
    );
    dispatcher.setKeymap(config.keymap.peek());
    const stop = config.keymap.subscribe((value) => dispatcher.setKeymap(value));
    const mouse = visits.installMouseNav();
    return () => {
      stop();
      dispatcher.dispose();
      mouse();
    };
  }, []);

  useEffect(() => {
    document.title = doc.title.value;
  }, [doc.title.value]);

  useEffect(() => {
    if (!file) return;
    const at = doc.pendingReveal.value;
    visits.visit(file.path, at?.path === file.path ? at.line : 0, at?.character ?? 0);
  }, [file?.path]);

  useEffect(() => {
    void treeFollow.now();
  }, [file?.path, treeFollow.on.value]);

  useEffect(() => {
    if (ws) projects.hide();
    else projects.show();
  }, [ws?.id]);

  useEffect(() => {
    void gitMarks.load(file?.path ?? null);
  }, [file?.path, git.state.value]);

  useEffect(() => {
    void tools.refresh();
    if (!ws) {
      merge.reset();
      visits.forget();
      return;
    }
    void git.refresh();
    void visits.load();
    void merge.load();
  }, [ws?.id]);

  return (
    <div
      class="app"
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.tree-menu')) treeMenu.close();
      }}
    >
      <Region name="chrome.top" />
      <Region name="chrome.main" fallback={<NoShell />} />

      <HunkPopup />
      <Projects />
      <SearchEverywhere />
      <Branches />
      <Push />
      <PluginSurfaces />
      <MergeScreen />
      <KeysHelp />
      <ToolPicker />
      <TreeMenu />
      <Prompt />
      <Notifications />
      <Symbols />
      <Tip />
    </div>
  );
}
