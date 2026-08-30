import { signal } from '@preact/signals';

export type NoteKind = 'info' | 'error' | 'work';

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  at: number;
}

const LIFETIME_MS = 60_000;

const LIMIT = 10;

export const notes = signal<Note[]>([]);

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export function notify(text: string, kind: NoteKind = 'info'): number {
  const id = nextId++;
  const note: Note = { id, kind, text, at: Date.now() };
  notes.value = [...notes.value, note].slice(-LIMIT);
  if (kind !== 'work') arm(id);
  return id;
}

export function settle(id: number, text: string, kind: NoteKind = 'info'): number {
  const at = notes.value.findIndex((note) => note.id === id);
  if (at === -1) return notify(text, kind);
  const next = [...notes.value];
  next[at] = { ...next[at]!, text, kind };
  notes.value = next;
  arm(id);
  return id;
}

export function dismiss(id: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  notes.value = notes.value.filter((note) => note.id !== id);
}

export function dismissAll(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  notes.value = [];
}

function arm(id: number): void {
  const known = timers.get(id);
  if (known) clearTimeout(known);
  timers.set(
    id,
    setTimeout(() => dismiss(id), LIFETIME_MS),
  );
}

export function say(message: string): void {
  notify(message, 'info');
}

export function complain(message: string): void {
  notify(message, 'error');
}
