import type { Diagnostic } from '@ide/protocol';
import { t } from '../i18n/index.js';
import { activeEditor } from '../state/editor.js';
import { offsetOf } from '../editor/diagnostics.js';
import { allProblems, openFile, openFileAt, reveal } from '../state/session.js';
import { focusEditor } from '../state/editor.js';

const MAX_ROWS = 500;

export function Problems() {
  const files = allProblems.value;
  if (files.length === 0) {
    return <div class="placeholder">{t('problems.empty')}</div>;
  }

  let left = MAX_ROWS;
  const shown: Array<{ path: string; diagnostics: Diagnostic[] }> = [];
  for (const file of files) {
    if (left <= 0) break;
    shown.push({ path: file.path, diagnostics: file.diagnostics.slice(0, left) });
    left -= file.diagnostics.length;
  }
  const total = files.reduce((sum, file) => sum + file.diagnostics.length, 0);
  const cut = total - shown.reduce((sum, file) => sum + file.diagnostics.length, 0);

  return (
    <div class="problems-list">
      {shown.map((file) => (
        <div class="problems-file" key={file.path}>
          <div
            class={`problems-where ${openFile.value?.path === file.path ? 'is-current' : ''}`}
            title={file.path}
            onClick={() => void jumpTo(file.path, file.diagnostics[0])}
          >
            <span class="problems-path">{file.path}</span>
            <span class="problems-count">{file.diagnostics.length}</span>
          </div>
          <ul class="problems">
            {file.diagnostics.map((item, i) => (
              <li
                key={`${item.range.start.line}:${i}`}
                class={`problem is-${item.severity}`}
                onClick={() => void jumpTo(file.path, item)}
              >
                <span class="problem-where">
                  {item.range.start.line + 1}:{item.range.start.character + 1}
                </span>
                <span class="problem-what">{item.message}</span>
                {item.code !== undefined && <span class="problem-code">TS{item.code}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {cut > 0 && <div class="problems-more">{t('problems.more', { count: cut })}</div>}
    </div>
  );
}

async function jumpTo(path: string, item: Diagnostic | undefined): Promise<void> {
  if (!item) return;
  const line = item.range.start.line;
  const character = item.range.start.character;

  if (openFile.peek()?.path !== path) {
    await openFileAt(path);
    reveal(path, line, character);
    return;
  }
  const view = activeEditor.value;
  if (!view) return;
  const at = offsetOf(view.state.doc, line, character);
  if (at === null) return;
  view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  focusEditor();
}
