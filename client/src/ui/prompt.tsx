import { useEffect, useRef } from 'preact/hooks';
import { focusTree, prompt, promptAnswer, promptCancel } from '../state/tree-ops.js';
import { t } from '../i18n/index.js';
import { Popup } from './popup.js';

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
      id="prompt"
      class="prompt"
      size={{ w: 460, h: ask.field ? 190 : 160 }}
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
