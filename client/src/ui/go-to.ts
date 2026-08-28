import { activeEditor, focusEditor } from '../state/editor.js';
import { offsetOf } from '../editor/diagnostics.js';
import { openFile, openFileAt, reveal } from '../state/session.js';

export async function goTo(path: string, line: number, character = 0): Promise<void> {
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
