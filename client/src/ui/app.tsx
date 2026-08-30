import { git, resetGit } from '../state/git.js';
import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { keymap as keymapSignal, settings as settingsSignal } from '../state/config.js';
import {
  current,
  closeFile,
  currentDiagnostics,
  dirty,
  editDoc,
  externalEpoch,
  openFile,
  complain,
  rpc,
  title,
} from '../state/session.js';
import { headFor, loadHead, showHunk } from '../state/git-marks.js';
import { askSymbol } from '../state/symbols.js';
import { takeFocusOnMount, wantsFocus } from '../state/editor.js';
import { chordHeld } from '../keys/chords.js';
import { dc, darcula, textStyle } from '../editor/darcula.js';
import { languageFor } from '../editor/languages.js';
import { paintCode } from '../editor/paint-line.js';
import { lineDiff } from '../editor/line-diff.js';
import { inputKeymap } from '../editor/input-keymap.js';
import { allProblems } from '../state/session.js';
import { registerCommands, resolveContext, missingCommands } from '../commands.js';
import { installDispatcher } from '../keys/dispatcher.js';
import { pendingReveal } from '../state/session.js';
import { refreshTerminals } from '../state/terminals.js';
import { refreshTools } from '../state/tools.js';
import { forgetVisits, installMouseNav, loadVisits, visit } from '../state/visits.js';
import { follow, following } from '../state/tree-follow.js';
import { SearchEverywhere } from './search-everywhere.js';
import { Branches } from './branches.js';
import { Notifications } from './notifications.js';
import { TreeMenu } from './tree-menu.js';
import { Prompt } from './prompt.js';
import { closeTreeMenu } from '../state/tree-menu.js';
import { Push } from './push.js';
import { loadMerge, resetMerge } from '../state/merge.js';
import { registerToolbarWishes } from './toolbar-wishes.js';
import { registerPanelWishes } from './panel-wishes.js';
import { Registry } from '../state/registry.js';
import { keysFor } from '../keys/keys-for.js';
import { hideTip, showTip } from '../state/tip.js';
import { Resizer } from './resizer.js';
import { widthOf } from '../state/layout.js';
import { runCommand } from '../keys/commands.js';
import { Projects } from './projects.js';
import { t } from '../i18n/index.js';
import { hideProjects, showProjects } from '../state/projects.js';
import { HunkPopup } from './hunk-popup.js';
import { KeysHelp } from './keys-help.js';
import { MergeScreen } from './merge.js';
import { PluginSurfaces } from './plugin-surfaces.js';
import { PickPopup, highlight, shiftMatches } from './pick-popup.js';
import { showTerminal } from '../state/terminals.js';
import { loadPlugins, pluginList } from '../state/plugins.js';
import { goTo } from './go-to.js';
import type { ClientSurface } from '@ide/api/client';
import { ToolPicker } from './tool-picker.js';
import { Tip } from './tip.js';
import { Symbols } from './symbols.js';
import { noteUnbound } from '../state/keys-help.js';

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
  const loaded = pluginList.value.map((one) => one.name);
  return (
    <div class="no-shell">
      <div class="no-shell-title">{t('shell.missing')}</div>
      <p class="no-shell-why">{t('shell.missing.why')}</p>
      <p class="no-shell-why">
        {loaded.length > 0
          ? t('shell.missing.loaded', { names: loaded.join(', ') })
          : t('shell.missing.none')}
      </p>
    </div>
  );
}

export function App() {
  const ws = current.value;
  const file = openFile.value;

  useEffect(() => {
    registerCommands();
    const surface: ClientSurface = {
      t,
      problems: allProblems,
      goTo,
      runCommand,
      keysFor,
      settings: settingsSignal,
      openDoc: openFile,
      editDoc,
      closeFile,
      dirty,
      fileDiagnostics: currentDiagnostics,
      externalEpoch,
      pendingReveal,
      headFor,
      visit,
      hover: (path, line, character) => rpc.call('lsp.hover', { path, line, character }),
      takeFocusOnMount,
      wantsFocus,
      chordHeld,
      unstable_PickPopup: PickPopup,
      unstable_highlight: highlight,
      unstable_shiftMatches: shiftMatches,
      unstable_showTerminal: showTerminal,
      unstable_showTip: showTip,
      unstable_hideTip: hideTip,
      unstable_Resizer: Resizer,
      unstable_widthOf: widthOf,
      unstable_diffLines: (before, after) => lineDiff.hunks(before, after),
      unstable_showHunk: showHunk,
      unstable_askSymbol: askSymbol,
      unstable_dc: dc,
      unstable_paintCode: paintCode,
      unstable_darcula: darcula,
      unstable_textStyle: textStyle,
      unstable_languageFor: languageFor,
      unstable_inputKeymap: inputKeymap,
    };
    void loadPlugins(surface, store).then(() => {
      const dead = missingCommands();
      if (dead.length) console.warn('[web-ide] команды без реализации:', dead.join(', '));
    });
    const dispatcher = installDispatcher(resolveContext, (key) => noteUnbound(key));
    dispatcher.setKeymap(keymapSignal.peek());
    const stop = keymapSignal.subscribe((value) => dispatcher.setKeymap(value));
    const mouse = installMouseNav();
    return () => {
      stop();
      dispatcher.dispose();
      mouse();
    };
  }, []);

  useEffect(() => {
    document.title = title.value;
  }, [title.value]);

  useEffect(() => {
    if (!file) return;
    const at = pendingReveal.value;
    visit(file.path, at?.path === file.path ? at.line : 0, at?.character ?? 0);
  }, [file?.path]);

  useEffect(() => {
    void follow();
  }, [file?.path, following.value]);

  useEffect(() => {
    if (ws) hideProjects();
    else showProjects();
  }, [ws?.id]);

  useEffect(() => {
    void loadHead(file?.path ?? null);
  }, [file?.path, git.state.value]);

  useEffect(() => {
    void refreshTools();
    if (!ws) {
      resetGit();
      resetMerge();
      forgetVisits();
      return;
    }
    void refreshTerminals();
    void git.refresh();
    void loadVisits();
    void loadMerge();
  }, [ws?.id]);

  return (
    <div
      class="app"
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.tree-menu')) closeTreeMenu();
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
