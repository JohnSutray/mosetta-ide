import { activate } from '@mosetta/ide-api/client';
import type { Ide, Note } from '@mosetta/ide-api/client';
import { effect } from '@preact/signals';
import { STYLE } from './style.js';

export default class NotificationsPlugin {
  readonly lifetimeMs = 60_000;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => this.view());

    effect(() => {
      const alive = new Set<number>();
      for (const note of this.ide.notes.all.value) {
        alive.add(note.id);
        if (note.kind === 'work') this.disarm(note.id);
        else if (!this.timers.has(note.id)) this.arm(note.id);
      }
      for (const id of [...this.timers.keys()]) if (!alive.has(id)) this.disarm(id);
    });
  }

  private arm(id: number): void {
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        this.ide.notes.dismiss(id);
      }, this.lifetimeMs),
    );
  }

  private disarm(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }

  private view() {
    const list = this.ide.notes.all.value;
    if (list.length === 0) return null;
    return (
      <div class="notes">
        {list.length > 1 && (
          <div class="notes-all" onClick={() => this.ide.notes.dismissAll()}>
            {this.ide.t('note.closeAll')}
          </div>
        )}
        {list.map((note: Note) => (
          <div key={note.id} class={`note is-${note.kind}`}>
            {note.kind === 'work' && <span class="spinner" />}
            <span class="note-text">{note.text}</span>
            <span class="note-close" title={this.ide.t('note.close')} onClick={() => this.ide.notes.dismiss(note.id)}>
              ×
            </span>
          </div>
        ))}
      </div>
    );
  }
}
