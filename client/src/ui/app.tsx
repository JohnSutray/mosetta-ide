import { Fragment } from 'preact';
import { useEffect } from 'preact/hooks';
import { DEFAULT_SETTINGS_FALLBACK } from '../state/fallback.js';
import { keymap as keymapSignal, settings as settingsSignal } from '../state/config.js';
import {
  connected,
  current,
  currentDiagnostics,
  dirty,
  errorCount,
  closeFile,
  editorPanelVisible,
  externalEpoch,
  lspStatuses,
  openFile,
  problemsPanelVisible,
  rpc,
  say,
  terminalPanelVisible,
  title,
  treePanelVisible,
  editDoc,
} from '../state/session.js';
import { activeEditor } from '../state/editor.js';
import { registerCommands, resolveContext, missingCommands } from '../commands.js';
import { installDispatcher, humanizeKey } from '../keys/dispatcher.js';
import { pendingReveal } from '../state/session.js';
import { refreshScripts, refreshTerminals } from '../state/terminals.js';
import { refreshTools } from '../state/tools.js';
import { forgetVisits, installMouseNav, loadVisits, visit } from '../state/visits.js';
import { Editor } from '../editor/editor.js';
import { SearchEverywhere } from './search-everywhere.js';
import { Branches } from './branches.js';
import { Notifications } from './notifications.js';
import { TreeMenu } from './tree-menu.js';
import { Prompt } from './prompt.js';
import { closeTreeMenu } from '../state/tree-menu.js';
import { Push } from './push.js';
import { gitState, refreshGit, resetGit } from '../state/git.js';
import { ScriptsPopup } from './scripts.js';
import { TerminalView } from './terminal.js';
import { Toolbar } from './toolbar.js';
import { PANELS, type PanelSpec } from './panels.js';
import { Resizer } from './resizer.js';
import { widthOf } from '../state/layout.js';
import { runCommand } from '../keys/commands.js';
import { Panel } from './panel.js';
import { Problems } from './problems.js';
import { Projects } from './projects.js';
import { Tree } from './tree.js';
import { t } from '../i18n/index.js';
import { hideProjects, showProjects } from '../state/projects.js';
import { headText, loadHead, showHunk } from '../state/git-marks.js';
import { HunkPopup } from './hunk-popup.js';
import { KeysHelp } from './keys-help.js';
import { ToolPicker } from './tool-picker.js';
import { Tip } from './tip.js';
import { Symbols } from './symbols.js';
import { askSymbol } from '../state/symbols.js';
import { noteUnbound } from '../state/keys-help.js';
import { SheepField } from './sheep.js';

export function App() {
  const ws = current.value;
  const file = openFile.value;
  const settings = settingsSignal.value ?? DEFAULT_SETTINGS_FALLBACK;

  useEffect(() => {
    registerCommands();
    const dead = missingCommands();
    if (dead.length) {
      console.warn('[web-ide] команды без реализации:', dead.join(', '));
    }
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
    if (ws) hideProjects();
    else showProjects();
  }, [ws?.id]);

  useEffect(() => {
    void loadHead(file?.path ?? null);
  }, [file?.path, gitState.value]);

  useEffect(() => {
    void refreshTools();
    if (!ws) {
      resetGit();
      forgetVisits();
      return;
    }
    void refreshTerminals();
    void refreshScripts();
    void refreshGit();
    void loadVisits();
  }, [ws?.id]);

  return (
    <div
      class="app"
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest('.tree-menu')) closeTreeMenu();
      }}
    >
      <Toolbar />

      <div class="columns">
        {open('left').map((panel) => (
          <Fragment key={panel.id}>
            <Panel
              class={`column-${panel.id}`}
              width={widthOf(panel.id)}
              title={t(panel.title)}
              onClose={() => runCommand(panel.command)}
            >
              {content(panel)}
            </Panel>
            <Resizer id={panel.id} side="left" />
          </Fragment>
        ))}

        {editorPanelVisible.value && (
        <Panel
          class="column-editor"
          title={file ? file.path : t('panel.editor.empty')}
          onClose={
            file ? () => void closeFile() : () => (editorPanelVisible.value = false)
          }
          actions={
            file ? (
              <>
                {file.truncated && <span class="tag">read-only</span>}
                {dirty.value && <span class="tag is-dirty">modified</span>}
              </>
            ) : null
          }
        >
          {file ? (
            <Editor
              file={file}
              head={headText.value}
              onHunk={showHunk}
              externalEpoch={externalEpoch.value}
              reveal={pendingReveal.value}
              settings={settings.editor}
              diagnostics={currentDiagnostics.value}
              onEdit={editDoc}
              onCaret={(line, character) => visit(file.path, line, character)}
              onModClick={(pos) => void askSymbol(pos)}
              onHover={(path, line, character) => rpc.call('lsp.hover', { path, line, character })}
              onMount={(view) => (activeEditor.value = view)}
            />
          ) : (
            <SheepField />
          )}
        </Panel>
        )}

        {open('right').map((panel) => (
          <Fragment key={panel.id}>
            <Resizer id={panel.id} side="right" />
            <Panel
              class={`column-${panel.id}`}
              width={widthOf(panel.id)}
              title={t(panel.title)}
              onClose={() => runCommand(panel.command)}
            >
              {content(panel)}
            </Panel>
          </Fragment>
        ))}
      </div>

      <HunkPopup />
      <Projects />
      <SearchEverywhere />
      <Branches />
      <Push />
      <ScriptsPopup />
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

function open(side: 'left' | 'right'): PanelSpec[] {
  return PANELS.filter((panel) => panel.side === side && panel.open.value);
}

function content(panel: PanelSpec) {
  switch (panel.id) {
    case 'tree':
      return <Tree />;
    case 'problems':
      return <Problems items={currentDiagnostics.value} />;
    case 'terminal':
      return <TerminalView />;
    default:
      return null;
  }
}
