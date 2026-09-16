import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { GitFileState, GitState } from '@mosetta/ide-plugin-git';
import type { ShelfItem } from './server.js';

export interface ChangesRemote {
  commit(ask: { message: string; files: string[]; amend?: boolean }): Promise<{ error: string | null }>;
  shelve(ask: { name: string; files: string[] }): Promise<{ error: string | null; item?: ShelfItem }>;
  shelves(): Promise<ShelfItem[]>;
  unshelve(ask: { id: string; keep?: boolean }): Promise<{ error: string | null }>;
  drop(ask: { id: string }): Promise<{ error: string | null }>;
}

export interface ChangeRow {
  path: string;
  state: GitFileState;
  picked: boolean;
}

export class Changes {
  constructor(
    private readonly remote: ChangesRemote,
    private readonly git: () => ReadonlySignal<GitState>,
    private readonly complain: (text: string) => void,
    readonly message: Signal<string>,
    private readonly unpicked: Signal<string[]>,
    private readonly rescan: () => Promise<void>,
  ) {}

  readonly open = signal(false);
  readonly shelf = signal<ShelfItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly amend = signal(false);

  readonly rows: ReadonlySignal<ChangeRow[]> = computed(() => {
    const files = this.git().value.files;
    return Object.keys(files)
      .sort()
      .map((path) => ({ path, state: files[path] as GitFileState, picked: !this.unpicked.value.includes(path) }));
  });

  readonly picked: ReadonlySignal<string[]> = computed(() =>
    this.rows.value.filter((row) => row.picked).map((row) => row.path),
  );

  readonly canCommit: ReadonlySignal<boolean> = computed(
    () => !this.busy.value && this.picked.value.length > 0 && this.message.value.trim() !== '',
  );

  show(): void {
    this.open.value = true;
    void this.loadShelf();
  }

  close(): void {
    this.open.value = false;
  }

  toggle(): void {
    if (this.open.value) this.close();
    else this.show();
  }

  toggleFile(path: string): void {
    const off = this.unpicked.value;
    this.unpicked.value = off.includes(path) ? off.filter((one) => one !== path) : [...off, path];
  }

  toggleAll(): void {
    const rows = this.rows.value;
    const every = rows.every((row) => row.picked);
    this.unpicked.value = every ? rows.map((row) => row.path) : [];
  }

  async loadShelf(): Promise<void> {
    try {
      this.shelf.value = await this.remote.shelves();
    } catch {
      this.shelf.value = [];
    }
  }

  async commit(): Promise<void> {
    if (!this.canCommit.value) return;
    const files = this.picked.value;
    const answer = await this.working(() =>
      this.remote.commit({ message: this.message.value, files, amend: this.amend.value }),
    );
    if (!answer || answer.error) return;
    batch(() => {
      this.message.value = '';
      this.amend.value = false;
      this.unpicked.value = [];
    });
    await this.rescan();
  }

  async shelve(): Promise<void> {
    const files = this.picked.value;
    if (this.busy.value || files.length === 0) return;
    const answer = await this.working(() => this.remote.shelve({ name: this.message.value, files }));
    if (!answer || answer.error) return;
    batch(() => {
      this.message.value = '';
      this.unpicked.value = [];
    });
    await this.rescan();
    await this.loadShelf();
  }

  async unshelve(id: string): Promise<void> {
    if (this.busy.value) return;
    const answer = await this.working(() => this.remote.unshelve({ id }));
    if (!answer || answer.error) return;
    await this.rescan();
    await this.loadShelf();
  }

  async drop(id: string): Promise<void> {
    if (this.busy.value) return;
    await this.working(() => this.remote.drop({ id }));
    await this.loadShelf();
  }

  private async working<T extends { error: string | null }>(run: () => Promise<T>): Promise<T | null> {
    batch(() => {
      this.busy.value = true;
      this.error.value = '';
    });
    try {
      const answer = await run();
      if (answer.error) {
        this.error.value = answer.error;
        this.complain(answer.error);
      }
      return answer;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      this.error.value = text;
      this.complain(text);
      return null;
    } finally {
      this.busy.value = false;
    }
  }
}
