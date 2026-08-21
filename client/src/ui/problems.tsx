import type { Diagnostic } from '@ide/protocol';
import { t } from '../i18n/index.js';
import { activeEditor } from '../state/editor.js';
import { offsetOf } from '../editor/diagnostics.js';

export function Problems({ items }: { items: Diagnostic[] }) {
  if (items.length === 0) {
    return <div class="placeholder">{t('problems.empty')}</div>;
  }
  return (
    <ul class="problems">
      {items.map((item, i) => (
        <li
          key={`${item.range.start.line}:${i}`}
          class={`problem is-${item.severity}`}
          onClick={() => jumpTo(item)}
        >
          <span class="problem-where">
            {item.range.start.line + 1}:{item.range.start.character + 1}
          </span>
          <span class="problem-what">{item.message}</span>
          {item.code !== undefined && <span class="problem-code">TS{item.code}</span>}
        </li>
      ))}
    </ul>
  );
}

function jumpTo(item: Diagnostic) {
  const view = activeEditor.value;
  if (!view) return;
  const at = offsetOf(view.state.doc, item.range.start.line, item.range.start.character);
  if (at === null) return;
  view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  view.focus();
}
