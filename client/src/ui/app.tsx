import { useEffect } from 'preact/hooks';
import { DEFAULT_SETTINGS_FALLBACK } from '../state/fallback.js';
import { keymap as keymapSignal, settings as settingsSignal } from '../state/config.js';
import {
  connected,
  current,
  currentDiagnostics,
  dirty,
  error,
  errorCount,
  externalEpoch,
  lspStatuses,
  notice,
  openFile,
  problemsPanelVisible,
  rpc,
  scriptsPanelVisible,
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
import { Scripts } from './scripts.js';
import { TerminalView } from './terminal.js';
import { Toolbar } from './toolbar.js';
import { Panel } from './panel.js';
import { Problems } from './problems.js';
import { Projects } from './projects.js';
import { Tree } from './tree.js';

export function App() {
  const ws = current.value;
  const file = openFile.value;
  const settings = settingsSignal.value ?? DEFAULT_SETTINGS_FALLBACK;

  useEffect(() => {
    registerCommands();
    const dead = missingCommands();
    if (dead.length) {
      console.warn('[new-ide] команды без реализации:', dead.join(', '));
    }
    const dispatcher = installDispatcher(resolveContext, (binding, reason) => {
      notice.value = `${humanizeKey(binding.key)} — ${reason}`;
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
    if (!ws) return;
    void refreshTerminals();
    void refreshScripts();
  }, [ws?.id]);

  return (
    <div class="app">
      <Toolbar />

      <div class="columns">
        {treePanelVisible.value && (
          <Panel class="column-tree" title={ws ? ws.name : 'Проекты'}>
            {ws ? <Tree /> : <Projects />}
          </Panel>
        )}

        <Panel
          class="column-editor"
          title={file ? file.path : 'Ничего не открыто'}
          actions={
            file ? (
              <>
                {file.truncated && <span class="tag">только чтение</span>}
                {dirty.value && <span class="tag is-dirty">изменён</span>}
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
              {ws ? 'Выберите файл в дереве' : 'Откройте проект слева'}
            </div>
          )}
        </Panel>

        {scriptsPanelVisible.value && (
          <Panel class="column-scripts" title="Скрипты">
            <Scripts />
          </Panel>
        )}

        {problemsPanelVisible.value && (
          <Panel class="column-problems" title="Ошибки">
            <Problems items={currentDiagnostics.value} />
          </Panel>
        )}

        {terminalPanelVisible.value && (
          <Panel class="column-terminal" title="Терминал">
            <TerminalView />
          </Panel>
        )}
      </div>

      <SearchEverywhere />
    </div>
  );
}
