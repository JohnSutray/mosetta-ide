import { signal } from '@preact/signals';

/**
 * The core's voice.
 *
 * Notes pile up in a list; how to show them and how long to hold them is the
 * notifications plugin's business. There is not a single timer here: work stays up
 * until `settle` ends it, and everything else lives until whoever shows it takes it
 * away. Without the plugin, notes are visible in the console — a silent error is the
 * worst of all.
 */

export type NoteKind = 'info' | 'error' | 'work';

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}

export class Notifications {
  /** More than a dozen on screen is no longer notification but a wall. */
  private readonly limit = 10;

  readonly notes = signal<Note[]>([]);

  private nextId = 1;

  notify(text: string, kind: NoteKind = 'info'): number {
    const id = this.nextId++;
    const note: Note = { id, kind, text, at: Date.now() };
    this.notes.value = [...this.notes.value, note].slice(-this.limit);
    if (kind === 'error') console.error(`[web-ide] ${text}`);
    else console.info(`[web-ide] ${text}`);
    return id;
  }

  /**
   * Replace the text of a note already on screen: "fetching…" becomes "fetched" rather
   * than a second message under the first. The old one is gone and a new one is born,
   * so the caller needs its number.
   */
  settle(id: number, text: string, kind: NoteKind = 'info'): number {
    const at = this.notes.value.findIndex((note) => note.id === id);
    if (at === -1) return this.notify(text, kind);
    const next = [...this.notes.value];
    next[at] = { ...next[at]!, text, kind };
    this.notes.value = next;
    return id;
  }

  dismiss(id: number): void {
    this.notes.value = this.notes.value.filter((note) => note.id !== id);
  }

  dismissAll(): void {
    this.notes.value = [];
  }

  /** Tell the user. */
  say(message: string): void {
    this.notify(message, 'info');
  }

  /** Complain: the same place, but in red. */
  complain(message: string): void {
    this.notify(message, 'error');
  }
}
