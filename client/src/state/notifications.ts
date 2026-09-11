import { signal } from '@preact/signals';

export type NoteKind = 'info' | 'error' | 'work';

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}

export class Notifications {
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

  say(message: string): void {
    this.notify(message, 'info');
  }

  complain(message: string): void {
    this.notify(message, 'error');
  }
}
