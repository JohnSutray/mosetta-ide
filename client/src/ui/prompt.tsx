import { useEffect, useRef } from 'preact/hooks';
import { focusTree, prompt, promptAnswer, promptCancel, type Ask } from '../state/tree-ops.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

const LINE = 18;
const CHROME = 86;
const FIELD = 36;
const CEILING = 420;

const COLUMNS = 60;

function heightFor(ask: Ask): number {
  const lines = (ask.text ?? '')
    .split('\n')
    .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / COLUMNS)), 0);
  return Math.min(CEILING, CHROME + (ask.field ? FIELD : 0) + lines * LINE);
}

export function Prompt() {
  const field = useRef<HTMLInputElement>(null);
  const ask = prompt.value;

  useEffect(() => {
    if (!ask?.field) return;
    field.current?.focus();
    const value = field.current?.value ?? '';
    const dot = value.lastIndexOf('.');
    field.current?.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [ask?.id]);

  useEffect(() => {
    if (!ask) focusTree();
  }, [ask === null]);

  if (!ask) return null;

  return (
    <Popup
      id={ask.field ? 'prompt-name' : 'prompt-confirm'}
      class="prompt"
      size={{ w: 460, h: heightFor(ask) }}
      min={{ w: 320, h: 140 }}
      onClose={promptCancel}
    >
      <div class="branches-head">
        <span class="branches-title">{ask.title}</span>
      </div>

      <form
        class="prompt-body"
        onSubmit={(event) => {
          event.preventDefault();
          promptAnswer(field.current?.value ?? '');
        }}
      >
        {ask.text && <div class="prompt-text">{ask.text}</div>}
        {ask.field && (
          <input
            ref={field}
            class="field"
            value={ask.value ?? ''}
            spellcheck={false}
            autocomplete="off"
          />
        )}
        {ask.error && <div class="prompt-error">{ask.error}</div>}

        <div class="prompt-foot">
          <button class="button" type="button" onClick={promptCancel}>
            {t('prompt.cancel')}
          </button>
          <button class={`button ${ask.danger ? 'is-danger' : ''}`} type="submit">
            {ask.confirm}
          </button>
        </div>
      </form>
    </Popup>
  );
}
