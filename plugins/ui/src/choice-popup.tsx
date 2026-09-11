import type { Windows } from './windows/windows.js';
import { useState } from 'preact/hooks';
import { Popup } from './popup.js';

export interface ChoiceRow {
  path: string;
  name: string;
  ref: string;
  current: boolean;
  mark?: string;
}

export interface ChoiceProps {
  windows: Windows;
  id: string;
  title: string;
  note: string;
  rows: ChoiceRow[];
  empty: string;
  customPlaceholder: string;
  apply: string;
  reset: string;
  onChoose(ref: string): void;
  onClose(): void;
}

export function ChoicePopup(props: ChoiceProps) {
  const [draft, setDraft] = useState('');
  return (
    <Popup windows={props.windows}
      id={props.id}
      keys="prompt"
      class="choice"
      size={{ w: 560, h: 380 }}
      min={{ w: 380, h: 240 }}
      onClose={() => props.onClose()}
    >
      <div class="choice-title">{props.title}</div>
      <div class="choice-note">{props.note}</div>

      <div class="choice-list">
        {props.rows.map((row) => (
          <div
            key={row.path}
            class={`choice-row ${row.current ? 'is-current' : ''}`}
            title={row.path}
            onClick={() => props.onChoose(row.ref)}
          >
            <span class="choice-name">{row.name}</span>
            <span class="choice-path">{row.path}</span>
            {row.mark && <span class="choice-mark">{row.mark}</span>}
          </div>
        ))}
        {props.rows.length === 0 && <div class="choice-empty">{props.empty}</div>}
      </div>

      <form
        class="choice-custom"
        onSubmit={(event) => {
          event.preventDefault();
          props.onChoose(draft.trim());
        }}
      >
        <input
          class="choice-input"
          value={draft}
          placeholder={props.customPlaceholder}
          spellcheck={false}
          onInput={(event) => setDraft((event.target as HTMLInputElement).value)}
        />
        <button class="choice-apply" type="submit">
          {props.apply}
        </button>
      </form>
      <div class="choice-reset" onClick={() => props.onChoose('')}>
        {props.reset}
      </div>
    </Popup>
  );
}
