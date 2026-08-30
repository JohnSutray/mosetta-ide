import { prompt, tree, type Ask } from '../state/tree-ops.js';
import { useEffect, useRef } from 'preact/hooks';
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
  const ask = prompt.ask.value;

  useEffect(() => {
    if (!ask?.field) return;
    field.current?.focus();
    const value = field.current?.value ?? '';
    const dot = value.lastIndexOf('.');
    field.current?.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [ask?.id]);

  useEffect(() => {
    if (!ask) tree.takeKeyboard();
  }, [ask === null]);

  if (!ask) return null;

  return (
    <Popup
      id={ask.field ? 'prompt-name' : 'prompt-confirm'}
      keys="prompt"
      class="prompt"
      size={{ w: 460, h: heightFor(ask) }}
      min={{ w: 320, h: 140 }}
      onClose={() => prompt.cancel()}
    >
      <div class="branches-head">
        <span class="branches-title">{ask.title}</span>
      </div>

      <form
        class="prompt-body"
        onSubmit={(event) => {
          event.preventDefault();
          void prompt.answer();
        }}
      >
        {ask.text && <div class="prompt-text">{ask.text}</div>}
        {ask.field && (
          <input
            ref={field}
            class="field"
            value={prompt.draft.value}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => (prompt.draft.value = (event.target as HTMLInputElement).value)}
          />
        )}
        {ask.error && <div class="prompt-error">{ask.error}</div>}

        <div class="prompt-foot">
          <button class="button" type="button" onClick={() => prompt.cancel()}>
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
