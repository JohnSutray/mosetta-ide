import { signal } from '@preact/signals';

export type NoteKind = 'info' | 'error' | 'work';

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}

export class Notifications {
  private readonly lifetimeMs = 60_000;
  private readonly limit = 10;

  readonly notes = signal<Note[]>([]);

  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  notify(text: string, kind: NoteKind = 'info'): number {
    const id = this.nextId++;
    const note: Note = { id, kind, text, at: Date.now() };
    this.notes.value = [...this.notes.value, note].slice(-this.limit);
    if (kind !== 'work') this.arm(id);
    return id;
  }

  settle(id: number, text: string, kind: NoteKind = 'info'): number {
    const at = this.notes.value.findIndex((note) => note.id === id);
    if (at === -1) return this.notify(text, kind);
    const next = [...this.notes.value];
    next[at] = { ...next[at]!, text, kind };
    this.notes.value = next;
    this.arm(id);
    return id;
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.notes.value = this.notes.value.filter((note) => note.id !== id);
  }

  dismissAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.notes.value = [];
  }

  private arm(id: number): void {
    const known = this.timers.get(id);
    if (known) clearTimeout(known);
    this.timers.set(
      id,
      setTimeout(() => this.dismiss(id), this.lifetimeMs),
    );
  }
}

export const notifications = new Notifications();

export function say(message: string): void {
  notifications.notify(message, 'info');
}

export function complain(message: string): void {
  notifications.notify(message, 'error');
}

export function notify(text: string, kind: NoteKind = 'info'): number {
  return notifications.notify(text, kind);
}

export function settle(id: number, text: string, kind: NoteKind = 'info'): number {
  return notifications.settle(id, text, kind);
}
