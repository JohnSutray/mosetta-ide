import type { Windows } from './windows/windows.js';
import { useState } from 'preact/hooks';
import { Popup } from './popup.js';

/**
 * The tool choice window.
 *
 * At the top what was found on the machine, below a field for a path of one's own, and
 * on a row of its own "as the system/project decides". The list is a hint rather than a
 * limit: learning by eye is cheaper than remembering and typing.
 *
 * A form rather than a domain: the terminal's shell and the scripts' package manager
 * both live on it, and each brings its own rows and its own captions. The labels arrive
 * as props: a widget has no dictionary, the dictionary belongs to whoever calls it.
 */
export interface ChoiceRow {
  path: string;
  name: string;
  /**
   * What will travel into the settings on choosing this row. We show the `path` — a
   * human needs the file — and we write the portable reference: the settings file
   * travels between machines in git.
   */
  ref: string;
  current: boolean;
  /** A note on the right: "in use", "the project decided so". */
  mark?: string;
}

export interface ChoiceProps {
  windows: Windows;
  id: string;
  title: string;
  note: string;
  rows: ChoiceRow[];
  /** The list is empty — and that is said in words rather than by emptiness. */
  empty: string;
  /** The caption of the field for one's own variant, and of the button beside it. */
  customPlaceholder: string;
  apply: string;
  /** An empty string is a legitimate choice, and it has to be visible as a button. */
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
