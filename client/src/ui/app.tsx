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
  title,
  treePanelVisible,
  editDoc,
} from '../state/session.js';
import { activeEditor } from '../state/editor.js';
import { registerCommands, resolveContext, missingCommands } from '../commands.js';
import { installDispatcher, humanizeKey } from '../keys/dispatcher.js';
import { pendingReveal } from '../state/session.js';
import { Editor } from '../editor/editor.js';
import { SearchEverywhere } from './search-everywhere.js';
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

  const lsp = lspStatuses.value[0];

  return (
    <div class="app">
      <div class="toolbar">
        <span class="brand">new-ide</span>
        <span class="toolbar-project">{ws ? ws.name : 'проект не открыт'}</span>
        {lsp && (
          <span class={`chip is-${lsp.state}`} title={lsp.detail ?? lsp.state}>
            {lsp.server}: {lsp.state === 'ready' ? `${lsp.openDocs} док.` : lsp.state}
          </span>
        )}
        {file && errorCount.value > 0 && (
          <span
            class="chip is-error"
            onClick={() => (problemsPanelVisible.value = !problemsPanelVisible.value)}
          >
            ошибок: {errorCount.value}
          </span>
        )}
        <span class="toolbar-spacer" />
        {notice.value && <span class="toolbar-notice">{notice.value}</span>}
        {error.value && <span class="toolbar-error">{error.value}</span>}
        <span class={`dot ${connected.value ? 'is-on' : 'is-off'}`} title="Связь с бэкендом" />
      </div>

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

        {problemsPanelVisible.value && (
          <Panel class="column-problems" title="Ошибки">
            <Problems items={currentDiagnostics.value} />
          </Panel>
        )}
      </div>

      <SearchEverywhere />
    </div>
  );
}
