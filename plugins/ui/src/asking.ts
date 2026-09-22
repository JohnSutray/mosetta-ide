import { batch, signal } from '@preact/signals';

/** What we ask: a name (there is a field) or consent (there is none). */
export interface Ask {
  id: number;
  title: string;
  text?: string;
  /** There is an input field — so we are asking for a name rather than for consent. */
  field: boolean;
  value?: string;
  /**
   * The value is a FILE NAME: then on opening, the name without its extension is
   * selected, since that is usually what gets edited. Everything else (a changelist's
   * name, a shelf entry's name) has no extension, and "clever" selection would leave
   * the user a tail like `.ts`.
   */
  filename?: boolean;
  confirm: string;
  danger?: boolean;
  error?: string;
  run: (value: string) => Promise<void>;
  /**
   * They refused — by the cross, by Escape or by a button.
   *
   * To the asker that is ALSO an answer: "run with the old code?" left unanswered means
   * "do not run", and they are obliged to learn that. A refusal used to be silence, and
   * there was nothing to wait for.
   */
  onCancel?: () => void;
}

/**
 * A modal with one question.
 *
 * It lived in the project tree while the tree was the only asker: "what shall we call
 * the file?" and "delete for sure?". The second reader is the changes panel: a shelf
 * entry's name, a changelist's name, renaming, "revert for sure". Their question is
 * exactly the same, so the widget has to be one: two copies would drift apart exactly
 * as the six toolbar badges did.
 *
 * A class of its own, because a modal has a life of its own: it is born with a question
 * and dies with an answer, while whatever called it stands as it stood all that time.
 */
export class Asking {
  readonly ask = signal<Ask | null>(null);

  /**
   * What is typed into the field RIGHT NOW.
   *
   * Apart from the initial name, and in state rather than in the DOM: a modal can be
   * confirmed not only by a button but by a key, and a command knows nothing about an
   * input field and should not. As a bonus, what was typed survives an error: a
   * server's refusal used to put the original name back into the field.
   */
  readonly draft = signal('');

  private nextId = 1;

  /** Ask a question. Exactly one is shown — a new one displaces the previous. */
  show(spec: Omit<Ask, 'id'>): void {
    const displaced = this.ask.peek();
    batch(() => {
      this.draft.value = spec.value ?? '';
      this.ask.value = { ...spec, id: this.nextId++ };
    });
    displaced?.onCancel?.();
  }

  cancel(): void {
    const asked = this.ask.value;
    this.ask.value = null;
    asked?.onCancel?.();
  }

  async answer(): Promise<void> {
    const asked = this.ask.value;
    if (!asked) return;
    const answer = this.draft.value.trim();
    if (asked.field && answer === '') return;
    try {
      await asked.run(answer);
      this.ask.value = null;
    } catch (err) {
      this.ask.value = { ...asked, error: describe(err) };
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
