import { batch, computed, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { GitFileState, GitState } from '@mosetta/ide-plugin-git';
import type { ShelfItem } from './server.js';
import { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist } from './changelist.js';

export { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist };

export interface ChangesRemote {
  commit(ask: {
    message: string;
    files: string[];
    amend?: boolean;
    name?: string;
    email?: string;
  }): Promise<{ error: string | null }>;
  shelve(ask: { name: string; files: string[] }): Promise<{ error: string | null; item?: ShelfItem }>;
  shelves(): Promise<ShelfItem[]>;
  unshelve(ask: {
    id: string;
    files?: string[];
  }): Promise<{ error: string | null; conflicts?: string[]; restored?: string[] }>;
  drop(ask: { id: string }): Promise<{ error: string | null }>;
  write(ask: { path: string; text: string }): Promise<{ error: string | null }>;
  patch(ask: { id: string }): Promise<{ text: string }>;
  patchBase(ask: { id: string; path: string }): Promise<{ text: string | null }>;
  lists(): Promise<Changelist[]>;
  listCreate(ask: { name: string }): Promise<Changelist>;
  listRename(ask: { id: string; name: string }): Promise<{ error: string | null }>;
  listRemove(ask: { id: string }): Promise<{ error: string | null }>;
  listMove(ask: { id: string; files: string[] }): Promise<{ error: string | null }>;
  revert(ask: { files: string[] }): Promise<{ error: string | null }>;
  shelfRename(ask: { id: string; name: string }): Promise<{ error: string | null }>;
  lastMessage(): Promise<{ text: string }>;
  draftRead(): Promise<{ text: string }>;
  draftWrite(ask: { text: string }): Promise<{ error: string | null }>;
  identity(): Promise<{ name: string; email: string; fromGit: { name: string; email: string } }>;
  identityWrite(ask: { name: string; email: string }): Promise<{ error: string | null }>;
}

export interface ChangeGroup {
  list: Changelist;
  rows: ChangeRow[];
  folded: boolean;
  checked: 'all' | 'some' | 'none';
}

export interface ChangeRow {
  path: string;
  state: GitFileState;
  picked: boolean;
  from?: string;
}

export class Changes {
  constructor(
    private readonly remote: ChangesRemote,
    private readonly git: () => ReadonlySignal<GitState>,
    private readonly complain: (text: string) => void,
    readonly message: Signal<string>,
    private readonly unpicked: Signal<string[]>,
    private readonly folded: Signal<string[]>,
    private readonly rescan: () => Promise<void>,
  ) {}

  readonly open = signal(false);
  readonly shelf = signal<ShelfItem[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly conflicts = signal<string[]>([]);
  readonly restored = signal<string[]>([]);
  readonly amend = signal(false);
  private filledByAmend: string | null = null;
  private beforeAmend = '';
  readonly openShelf = signal<string | null>(null);
  readonly authorName = signal('');
  readonly authorEmail = signal('');
  private gitIdentity = { name: '', email: '' };

  readonly shelfPicked = signal<Record<string, string[]>>({});
  readonly lists = signal<Changelist[]>([]);
  readonly selected = signal<string[]>([]);
  readonly focus = signal<string | null>(null);

  readonly rows: ReadonlySignal<ChangeRow[]> = computed(() => {
    const snapshot = this.git().value;
    const files = snapshot.files;
    return Object.keys(files)
      .sort()
      .map((path) => ({
        path,
        state: files[path] as GitFileState,
        picked: !this.unpicked.value.includes(path),
        ...(snapshot.moved[path] ? { from: snapshot.moved[path] } : {}),
      }));
  });

  readonly picked: ReadonlySignal<string[]> = computed(() =>
    this.rows.value.filter((row) => row.picked).map((row) => row.path),
  );

  readonly groups: ReadonlySignal<ChangeGroup[]> = computed(() => {
    const rows = this.rows.value;
    const lists = this.lists.value.length > 0 ? this.lists.value : [{ id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] }];
    const folded = this.folded.value;
    const where = new Map<string, string>();
    for (const list of lists) {
      if (RESERVED.includes(list.id)) continue;
      for (const file of list.files) where.set(file, list.id);
    }
    return lists
      .map((list) => {
        const mine = rows.filter((row) => this.listOf(row, where) === list.id);
        return {
          list,
          rows: mine,
          folded: folded.includes(list.id),
          checked: this.checkedness(mine),
        };
      })
      .filter((group) => group.rows.length > 0 || group.list.id !== UNRESOLVED_LIST);
  });

  visibleOrder(): string[] {
    return this.groups.value.flatMap((group) => (group.folded ? [] : group.rows.map((row) => row.path)));
  }

  private listOf(row: ChangeRow, where: Map<string, string>): string {
    if (row.state === 'conflict') return UNRESOLVED_LIST;
    const named = where.get(row.path);
    return named && named !== UNRESOLVED_LIST ? named : DEFAULT_LIST;
  }

  private checkedness(rows: ChangeRow[]): 'all' | 'some' | 'none' {
    if (rows.length === 0) return 'none';
    if (rows.every((row) => row.picked)) return 'all';
    return rows.some((row) => row.picked) ? 'some' : 'none';
  }

  readonly signed: ReadonlySignal<boolean> = computed(
    () => this.authorName.value.trim() !== '' && this.authorEmail.value.trim() !== '',
  );

  readonly canCommit: ReadonlySignal<boolean> = computed(
    () =>
      !this.busy.value &&
      this.picked.value.length > 0 &&
      this.message.value.trim() !== '' &&
      this.signed.value,
  );

  follow(
    tab: { readonly value: { root: string } | null },
    attached: { readonly value: unknown },
    live: { readonly value: boolean },
  ): void {
    let seenRoot: string | null = null;
    effect(() => {
      const root = tab.value?.root ?? null;
      if (root === seenRoot) return;
      seenRoot = root;
      batch(() => {
        this.shelf.value = [];
        this.lists.value = [];
        this.selected.value = [];
        this.focus.value = null;
        this.conflicts.value = [];
        this.restored.value = [];
      });
    });
    effect(() => {
      if (!attached.value || !live.value) return;
      void this.loadShelf();
      void this.loadLists();
      void this.loadDraft();
      void this.loadIdentity();
    });

    let hadConflicts = false;
    effect(() => {
      const now = Object.values(this.git().value.files).some((state) => state === 'conflict');
      if (hadConflicts && !now) this.conflicts.value = [];
      hadConflicts = now;
    });
  }

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

  pick(path: string, mods: { ctrl?: boolean; shift?: boolean } = {}): void {
    const order = this.visibleOrder();
    batch(() => {
      if (mods.shift && this.focus.value) {
        const from = order.indexOf(this.focus.value);
        const to = order.indexOf(path);
        if (from !== -1 && to !== -1) {
          const [a, b] = from <= to ? [from, to] : [to, from];
          this.selected.value = order.slice(a, b + 1);
          return;
        }
      }
      if (mods.ctrl) {
        const have = this.selected.value;
        this.selected.value = have.includes(path) ? have.filter((one) => one !== path) : [...have, path];
        this.focus.value = path;
        return;
      }
      this.selected.value = [path];
      this.focus.value = path;
    });
  }

  only(path: string): void {
    batch(() => {
      this.selected.value = [path];
      this.focus.value = path;
    });
  }

  step(delta: 1 | -1): void {
    const order = this.visibleOrder();
    if (order.length === 0) return;
    const at = order.indexOf(this.focus.value ?? '');
    const next = at === -1 ? (delta === 1 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, at + delta));
    this.only(order[next]!);
  }

  targets(): string[] {
    const picked = this.selected.value;
    if (picked.length > 0) return picked;
    return this.focus.value ? [this.focus.value] : [];
  }

  toggleFold(id: string): void {
    const list = this.folded.value;
    this.folded.value = list.includes(id) ? list.filter((one) => one !== id) : [...list, id];
  }

  toggleGroup(id: string): void {
    const group = this.groups.value.find((one) => one.list.id === id);
    if (!group) return;
    const paths = group.rows.map((row) => row.path);
    const off = this.unpicked.value.filter((one) => !paths.includes(one));
    this.unpicked.value = group.checked === 'all' ? [...off, ...paths] : off;
  }

  async loadLists(): Promise<void> {
    try {
      this.lists.value = await this.remote.lists();
    } catch (err) {
      this.complain(err instanceof Error ? err.message : String(err));
    }
  }

  async createList(name: string): Promise<Changelist> {
    const made = await this.remote.listCreate({ name });
    await this.loadLists();
    return made;
  }

  async renameList(id: string, name: string): Promise<void> {
    await this.remote.listRename({ id, name });
    await this.loadLists();
  }

  async removeList(id: string): Promise<void> {
    await this.remote.listRemove({ id });
    await this.loadLists();
  }

  async moveTo(id: string, files: string[]): Promise<void> {
    if (files.length === 0) return;
    await this.remote.listMove({ id, files });
    await this.loadLists();
  }

  async revert(files: string[]): Promise<void> {
    if (files.length === 0) return;
    const answer = await this.working(() => this.remote.revert({ files }));
    if (!answer || answer.error) return;
    await this.rescan();
  }

  async renameShelf(id: string, name: string): Promise<void> {
    await this.remote.shelfRename({ id, name });
    await this.loadShelf();
  }

  async toggleAmend(): Promise<void> {
    const on = !this.amend.value;
    this.amend.value = on;
    if (on) {
      this.beforeAmend = this.message.value;
      const { text } = await this.remote.lastMessage();
      if (!this.amend.value) return;
      if (text === '') return;
      this.filledByAmend = text;
      this.message.value = text;
      return;
    }
    if (this.filledByAmend !== null && this.message.value === this.filledByAmend) {
      this.message.value = this.beforeAmend;
    }
    this.filledByAmend = null;
  }

  toggleShelfFile(id: string, path: string): void {
    const picked = this.shelfPicked.value[id] ?? [];
    const next = picked.includes(path) ? picked.filter((one) => one !== path) : [...picked, path];
    this.shelfPicked.value = { ...this.shelfPicked.value, [id]: next };
  }

  toggleShelfItem(id: string): void {
    const item = this.shelf.value.find((one) => one.id === id);
    if (!item) return;
    const picked = this.shelfPicked.value[id] ?? [];
    const all = item.files.length > 0 && picked.length === item.files.length;
    this.shelfPicked.value = { ...this.shelfPicked.value, [id]: all ? [] : [...item.files] };
  }

  shelfChecked(id: string): 'all' | 'some' | 'none' {
    const item = this.shelf.value.find((one) => one.id === id);
    const picked = this.shelfPicked.value[id] ?? [];
    if (!item || item.files.length === 0 || picked.length === 0) return 'none';
    return picked.length === item.files.length ? 'all' : 'some';
  }

  readonly canUnshelve: ReadonlySignal<boolean> = computed(() =>
    Object.values(this.shelfPicked.value).some((files) => files.length > 0),
  );

  async unshelvePicked(): Promise<void> {
    if (this.busy.value) return;
    const picked = this.shelfPicked.value;
    for (const [id, files] of Object.entries(picked)) {
      if (files.length === 0) continue;
      const item = this.shelf.value.find((one) => one.id === id);
      const whole = !item || files.length === item.files.length;
      const answer = await this.working(() =>
        this.remote.unshelve(whole ? { id } : { id, files }),
      );
      if (!answer || answer.error) return;
      this.sayIfConflicted(answer.conflicts);
      this.restored.value = answer.restored ?? [];
    }
    await this.rescan();
  }

  toggleShelf(id: string): void {
    this.openShelf.value = this.openShelf.value === id ? null : id;
  }

  async loadIdentity(): Promise<void> {
    try {
      const who = await this.remote.identity();
      this.gitIdentity = who.fromGit;
      batch(() => {
        this.authorName.value = who.name;
        this.authorEmail.value = who.email;
      });
    } catch {}
  }

  saveIdentity(): Promise<void> {
    const name = this.authorName.value.trim();
    const email = this.authorEmail.value.trim();
    const own = {
      name: name === this.gitIdentity.name ? '' : name,
      email: email === this.gitIdentity.email ? '' : email,
    };
    return this.remote.identityWrite(own).then(() => undefined);
  }

  async loadDraft(): Promise<void> {
    try {
      const { text } = await this.remote.draftRead();
      if (this.message.value === '') this.message.value = text;
    } catch {}
  }

  saveDraft(): Promise<void> {
    return this.remote.draftWrite({ text: this.message.value }).then(() => undefined);
  }

  async loadShelf(): Promise<void> {
    try {
      this.shelf.value = await this.remote.shelves();
    } catch (err) {
      this.complain(err instanceof Error ? err.message : String(err));
    }
  }

  async commit(): Promise<void> {
    if (!this.canCommit.value) return;
    const files = this.picked.value;
    const answer = await this.working(() =>
      this.remote.commit({
        message: this.message.value,
        files,
        amend: this.amend.value,
        name: this.authorName.value.trim(),
        email: this.authorEmail.value.trim(),
      }),
    );
    if (!answer || answer.error) return;
    batch(() => {
      this.message.value = '';
      this.amend.value = false;
      this.unpicked.value = [];
    });
    await this.rescan();
  }

  async shelve(name: string, files: string[] = this.picked.value): Promise<void> {
    if (this.busy.value || files.length === 0) return;
    const answer = await this.working(() => this.remote.shelve({ name, files }));
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
    this.sayIfConflicted(answer.conflicts);
    this.restored.value = answer.restored ?? [];
    await this.rescan();
  }

  private sayIfConflicted(conflicts: string[] | undefined): void {
    if (!conflicts || conflicts.length === 0) return;
    this.conflicts.value = conflicts;
  }

  async drop(id: string): Promise<void> {
    if (this.busy.value) return;
    await this.working(() => this.remote.drop({ id }));
    if (this.openShelf.value === id) this.openShelf.value = null;
    await this.loadShelf();
  }

  patchOf(id: string): Promise<{ text: string }> {
    return this.remote.patch({ id });
  }

  writeFile(path: string, text: string): Promise<{ error: string | null } | null> {
    return this.working(() => this.remote.write({ path, text }));
  }

  baseOf(id: string, path: string): Promise<{ text: string | null }> {
    return this.remote.patchBase({ id, path });
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
