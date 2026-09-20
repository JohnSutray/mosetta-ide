import { useT } from '@mosetta/ide-api/client';
import { useEffect, useRef } from 'preact/hooks';
import { Popup } from './popup.js';
import type { Ask, Asking } from './asking.js';
import type { Windows } from './windows/windows.js';

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

export function AskPopup({
  windows,
  asking,
  onClosed,
}: {
  windows: Windows;
  asking: Asking;
  onClosed?: () => void;
}) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const ask = asking.ask.value;

  useEffect(() => {
    if (!ask?.field) return;
    field.current?.focus();
    const value = field.current?.value ?? '';
    const dot = ask.filename ? value.lastIndexOf('.') : -1;
    field.current?.setSelectionRange(0, dot > 0 ? dot : value.length);
  }, [ask?.id]);

  useEffect(() => {
    if (!ask) onClosed?.();
  }, [ask === null]);

  useEffect(() => {
    if (!ask) return undefined;
    windows.asking.value = asking;
    return () => {
      if (windows.asking.peek() === asking) windows.asking.value = null;
    };
  }, [ask !== null, asking]);

  if (!ask) return null;

  return (
    <Popup windows={windows}
      id={ask.field ? 'prompt-name' : 'prompt-confirm'}
      keys="prompt"
      class="prompt"
      size={{ w: 460, h: heightFor(ask) }}
      min={{ w: 320, h: 140 }}
      onClose={() => asking.cancel()}
    >
      <div class="prompt-head">
        <span class="prompt-title">{ask.title}</span>
      </div>

      <form
        class="prompt-body"
        onSubmit={(event) => {
          event.preventDefault();
          void asking.answer();
        }}
      >
        {ask.text && <div class="prompt-text">{ask.text}</div>}
        {ask.field && (
          <input
            ref={field}
            class="field"
            value={asking.draft.value}
            spellcheck={false}
            autocomplete="off"
            onInput={(event) => (asking.draft.value = (event.target as HTMLInputElement).value)}
          />
        )}
        {ask.error && <div class="prompt-error">{ask.error}</div>}

        <div class="prompt-foot">
          <button class="button" type="button" onClick={() => asking.cancel()}>
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
