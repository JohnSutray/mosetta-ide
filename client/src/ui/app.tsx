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
import { Editor } from '../editor/editor.js';
import { SearchEverywhere } from './search-everywhere.js';
import { Branches } from './branches.js';
import { Notifications } from './notifications.js';
import { Push } from './push.js';
import { refreshGit, resetGit } from '../state/git.js';
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
import { Icon } from './icons.js';
import { projectsVisible } from '../state/projects.js';

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
    const dispatcher = installDispatcher(resolveContext, (binding, reason) => {
      say(`${humanizeKey(binding.key)} — ${reason}`);
    });
    dispatcher.setKeymap(keymapSignal.peek());
    const stop = keymapSignal.subscribe((value) => dispatcher.setKeymap(value));
    return () => {
      stop();
      dispatcher.dispose();
    };
  }, []);

  useEffect(() => {
    document.title = title.value;
  }, [title.value]);

  useEffect(() => {
    if (!ws) {
      resetGit();
      return;
    }
    void refreshTerminals();
    void refreshScripts();
    void refreshGit();
  }, [ws?.id]);

  return (
    <div class="app">
      <Toolbar />

      <div class="columns">
        {open('left').map((panel) => (
          <Fragment key={panel.id}>
            <Panel
              class={`column-${panel.id}`}
              width={widthOf(panel.id)}
              title={titleOf(panel)}
              actions={actionsOf(panel)}
              onClose={() => runCommand(panel.command)}
            >
              {content(panel)}
            </Panel>
            <Resizer id={panel.id} side="left" />
          </Fragment>
        ))}

        <Panel
          class="column-editor"
          title={file ? file.path : t('panel.editor.empty')}
          onClose={file ? () => void closeFile() : undefined}
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
              externalEpoch={externalEpoch.value}
              reveal={pendingReveal.value}
              settings={settings.editor}
              diagnostics={currentDiagnostics.value}
              onEdit={editDoc}
              onHover={(path, line, character) => rpc.call('lsp.hover', { path, line, character })}
              onMount={(view) => (activeEditor.value = view)}
            />
          ) : (
            <div class="placeholder">
              {ws ? t('tree.pick') : t('tree.openProject')}
            </div>
          )}
        </Panel>

        {open('right').map((panel) => (
          <Fragment key={panel.id}>
            <Resizer id={panel.id} side="right" />
            <Panel
              class={`column-${panel.id}`}
              width={widthOf(panel.id)}
              title={panel.title}
              onClose={() => runCommand(panel.command)}
            >
              {content(panel)}
            </Panel>
          </Fragment>
        ))}
      </div>

      <SearchEverywhere />
      <Branches />
      <Push />
      <ScriptsPopup />
      <Notifications />
    </div>
  );
}

function titleOf(panel: PanelSpec): string {
  if (panel.id === 'tree' && showsProjects()) return t('panel.projects');
  return t(panel.title);
}

function actionsOf(panel: PanelSpec) {
  if (panel.id !== 'tree' || !current.value) return null;
  const shown = projectsVisible.value;
  return (
    <span
      class={`panel-action ${shown ? 'is-active' : ''}`}
      title={shown ? t('tree.showTree') : t('tree.showProjects')}
      onClick={() => runCommand(shown ? 'projects.close' : 'projects.show')}
    >
      <Icon name="projects" filled={shown} />
    </span>
  );
}

function showsProjects(): boolean {
  return !current.value || projectsVisible.value;
}

function open(side: 'left' | 'right'): PanelSpec[] {
  return PANELS.filter((panel) => panel.side === side && panel.open.value);
}

function content(panel: PanelSpec) {
  switch (panel.id) {
    case 'tree':
      return showsProjects() ? <Projects /> : <Tree />;
    case 'problems':
      return <Problems items={currentDiagnostics.value} />;
    case 'terminal':
      return <TerminalView />;
    default:
      return null;
  }
}
