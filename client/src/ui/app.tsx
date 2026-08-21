import { useEffect } from 'preact/hooks';
import {
  connected,
  current,
  dirty,
  error,
  openFile,
  saveFile,
  title,
} from '../state/session.js';
import { Editor } from '../editor/editor.js';
import { Panel } from './panel.js';
import { Projects } from './projects.js';
import { Tree } from './tree.js';

export function App() {
  const ws = current.value;
  const file = openFile.value;

  useEffect(() => {
    document.title = title.value;
  }, [title.value]);

  return (
    <div class="app">
      <div class="toolbar">
        <span class="brand">new-ide</span>
        <span class="toolbar-project">{ws ? ws.name : 'проект не открыт'}</span>
        <span class="toolbar-spacer" />
        {error.value && <span class="toolbar-error">{error.value}</span>}
        <span class={`dot ${connected.value ? 'is-on' : 'is-off'}`} title="Связь с бэкендом" />
      </div>

      <div class="columns">
        <Panel class="column-tree" title={ws ? ws.name : 'Проекты'}>
          {ws ? <Tree /> : <Projects />}
        </Panel>

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
              onDirty={(value) => (dirty.value = value)}
              onSave={(text) => void saveFile(text)}
            />
          ) : (
            <div class="placeholder">
              {ws ? 'Выберите файл в дереве' : 'Откройте проект слева'}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
