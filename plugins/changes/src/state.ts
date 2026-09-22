import { batch, computed, effect, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { GitFileState, GitState } from '@mosetta/ide-plugin-git';
import type { ShelfItem } from './server.js';
import { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist } from './changelist.js';

export { DEFAULT_LIST, RESERVED, UNRESOLVED_LIST, type Changelist };

/** The server half — it arrives through the constructor. */
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
  /** Put a file's text down through the memory layer: reverting a hunk in a closed file. */
  write(ask: { path: string; text: string }): Promise<{ error: string | null }>;
  /** The patch's text — what is put aside is shown by it. */
  patch(ask: { id: string }): Promise<{ text: string }>;
  /**
   * The text the patch was computed from: the "how it was" for showing what is put
   * aside.
   */
  patchBase(ask: { id: string; path: string }): Promise<{ text: string | null }>;
  lists(): Promise<Changelist[]>;
  listCreate(ask: { name: string }): Promise<Changelist>;
  listRename(ask: { id: string; name: string }): Promise<{ error: string | null }>;
  listRemove(ask: { id: string }): Promise<{ error: string | null }>;
  listMove(ask: { id: string; files: string[] }): Promise<{ error: string | null }>;
  revert(ask: { files: string[] }): Promise<{ error: string | null }>;
  shelfRename(ask: { id: string; name: string }): Promise<{ error: string | null }>;
  /** The last commit's message: it is edited on `--amend`. */
  lastMessage(): Promise<{ text: string }>;
  /** The draft message is the project's household rather than the tab's. */
  draftRead(): Promise<{ text: string }>;
  draftWrite(ask: { text: string }): Promise<{ error: string | null }>;
  /** What the commit is signed with: git's config plus the user's replacement. */
  identity(): Promise<{ name: string; email: string; fromGit: { name: string; email: string } }>;
  identityWrite(ask: { name: string; email: string }): Promise<{ error: string | null }>;
}

/** A group of rows: a changelist and what lies in it right now. */
export interface ChangeGroup {
  list: Changelist;
  rows: ChangeRow[];
  /** Whether it is folded: a folded one still names how many are in it. */
  folded: boolean;
  /** All ticked, some or none — the group's tick box shows that. */
  checked: 'all' | 'some' | 'none';
}

/** A panel row: the file, its state in git's eyes, and whether it is ticked. */
export interface ChangeRow {
  path: string;
  state: GitFileState;
  picked: boolean;
  /**
   * Where the file moved from: `git status` knows that exactly, and without the old
   * name the diff would ask "how it was" of a path that is not in the commit — and the
   * whole file would look as if it had been written afresh.
   */
  from?: string;
}

/**
 * The changes panel: what we are committing and what we are putting aside.
 *
 * The panel has NO idea of its own about what has changed: the list is taken from the
 * git neighbour's snapshot, which is computed in the background and handed over
 * instantly. The panel adds exactly one piece of knowledge of its own to it — which
 * files the user has ticked.
 *
 * The ticks are stored as a list of the UNTICKED rather than of the ticked: a file that
 * has appeared in the work just now is obliged to be ticked — the user has only just
 * written it and almost certainly wants to commit it. A list of the ticked would give
 * the opposite behaviour and make them tick every new row by hand.
 */
export class Changes {
  constructor(
    private readonly remote: ChangesRemote,
    /**
     * The neighbour's snapshot of the repository: the branch and the state of the
     * files.
     */
    private readonly git: () => ReadonlySignal<GitState>,
    /** Say it out loud: git's grumbling is shown to the user rather than swallowed. */
    private readonly complain: (text: string) => void,
    /** The commit message survives the closing of the panel — it is a draft. */
    readonly message: Signal<string>,
    /**
     * The unticked boxes. Remembered per tab: the ticks are a view rather than the
     * project's state.
     */
    private readonly unpicked: Signal<string[]>,
    /**
     * The folded changelists. A view rather than the project's state — remembered per
     * tab.
     */
    private readonly folded: Signal<string[]>,
    /**
     * Ask the neighbour to recompute the snapshot. A commit does not touch files, and
     * the memory says nothing about it — without the asking, the list would stay full
     * immediately after being committed.
     */
    private readonly rescan: () => Promise<void>,
  ) {}

  readonly open = signal(false);
  readonly shelf = signal<ShelfItem[]>([]);
  readonly busy = signal(false);
  /** The last grumble: shown in the panel rather than as a notification on top. */
  readonly error = signal('');
  /** The files the shelf's patch has argued over. */
  readonly conflicts = signal<string[]>([]);
  /**
   * The files that were not in the tree and have come back from the shelf. Keeping
   * quiet about that is not allowed: a file has appeared where the user did not leave
   * it.
   */
  readonly restored = signal<string[]>([]);
  readonly amend = signal(false);
  /**
   * What the amend has put in, and what was there before it.
   *
   * Two strings rather than a flag: turning the amend off is obliged to bring back the
   * previous message, but ONLY if the user has not touched what was put in. If they
   * have touched it, it is their text now, and taking it away is not allowed.
   */
  private filledByAmend: string | null = null;
  private beforeAmend = '';
  /**
   * Which shelf entry is opened. One: the shelf is a list rather than a tree, and a
   * second opened one would mean looking for a file in two places.
   */
  readonly openShelf = signal<string | null>(null);
  /**
   * What the commit is signed with: what is shown in the fields.
   *
   * Empty means there is nothing in the local config nor in the global one, and the
   * commit will not happen: `git commit` without a signature refuses to work by itself.
   * The fields turn red and the button goes out — a refusal is spoken of BEFORE the
   * press rather than after.
   */
  readonly authorName = signal('');
  readonly authorEmail = signal('');
  /**
   * What git itself knows about the signature: by it you can see what the user has
   * replaced it with.
   */
  private gitIdentity = { name: '', email: '' };

  /** What is ticked ON THE SHELF: `entry id` → paths. */
  readonly shelfPicked = signal<Record<string, string[]>>({});
  /** What changelists there are. They arrive from the server, like the shelf. */
  readonly lists = signal<Changelist[]>([]);
  /**
   * What is SELECTED. A selection and the tick boxes are different things: a tick box
   * says "this will go into the commit", a selection says "this is what the action is
   * over now".
   */
  readonly selected = signal<string[]>([]);
  /**
   * Where the caret is: Shift counts a range from it, and it is what dances about on
   * the arrows.
   */
  readonly focus = signal<string | null>(null);

  /** The files under git, in path order: a list of changes has no "best" order. */
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

  /**
   * The rows laid out by changelist.
   *
   * There is one rule and it matters more than convenience: the CONFLICTS are always in
   * `unresolved`, whatever the user says. It was not they who put them there but git,
   * and moving a conflict into "their own" list means losing sight of it exactly when
   * it must not be lost.
   *
   * Everything assigned nowhere goes into `changes`. So a file cannot disappear
   * altogether: the list it "lies in" may cease to be, but "everything else" may not.
   */
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

  /**
   * The order of the rows ON SHOW: the arrows walk by it and the search by letters
   * looks by it.
   */
  visibleOrder(): string[] {
    return this.groups.value.flatMap((group) => (group.folded ? [] : group.rows.map((row) => row.path)));
  }

  /**
   * Which list a file is in: a conflict is always in `unresolved`, the rest wherever
   * they are assigned.
   */
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

  /**
   * Whether there is a signature. There is not — the commit will not happen, and that
   * is visible before the press.
   */
  readonly signed: ReadonlySignal<boolean> = computed(
    () => this.authorName.value.trim() !== '' && this.authorEmail.value.trim() !== '',
  );

  /**
   * Whether there is anything to commit: without this the button would deceive by being
   * pressable.
   */
  readonly canCommit: ReadonlySignal<boolean> = computed(
    () =>
      !this.busy.value &&
      this.picked.value.length > 0 &&
      this.message.value.trim() !== '' &&
      this.signed.value,
  );

  /**
   * The shelf is the PROJECT's property rather than the panel's.
   *
   * It used to be read when the panel was OPENED, and a panel opened over from the last
   * session showed "the shelf is empty" until the first operation — that is, it lied
   * about exactly what the shelf exists for: about put-aside work that must not be
   * forgotten. Now we read it on attachment, the way the tree reads its root: we reset
   * by the TAB's project (it survives a break in the socket) and ask by the ATTACHED
   * one — before the attachment there is nobody for the server to ask.
   *
   * What a project is, the panel has no need to know: all that matters to it is that it
   * has changed.
   */
  follow(
    tab: { readonly value: { root: string } | null },
    attached: { readonly value: unknown },
    /** Whether the wire is alive: a break and a return are a reason to re-read. */
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

  /** The key that opened the panel closes it too. */
  toggle(): void {
    if (this.open.value) this.close();
    else this.show();
  }

  toggleFile(path: string): void {
    const off = this.unpicked.value;
    this.unpicked.value = off.includes(path) ? off.filter((one) => one !== path) : [...off, path];
  }

  /** Tick all or untick all — by what is visible now. */
  toggleAll(): void {
    const rows = this.rows.value;
    const every = rows.every((row) => row.picked);
    this.unpicked.value = every ? rows.map((row) => row.path) : [];
  }

  /**
   * A click on a row: the mechanics of a list.
   *
   * With no modifiers it is "this one only", Ctrl adds and removes one at a time, Shift
   * takes a range from the caret. The rule is the same as everywhere in the OS, and
   * that is exactly why it is not up for discussion: a list in which Ctrl works
   * differently reads as broken.
   */
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

  /** Select one row and put the caret on it — for the arrows and the search by letters. */
  only(path: string): void {
    batch(() => {
      this.selected.value = [path];
      this.focus.value = path;
    });
  }

  /** An arrow: one row up or down through the order ON SHOW. */
  step(delta: 1 | -1): void {
    const order = this.visibleOrder();
    if (order.length === 0) return;
    const at = order.indexOf(this.focus.value ?? '');
    const next = at === -1 ? (delta === 1 ? 0 : order.length - 1) : Math.min(order.length - 1, Math.max(0, at + delta));
    this.only(order[next]!);
  }

  /**
   * What the action is over: the selection, and if nothing is selected, the row under
   * the caret.
   */
  targets(): string[] {
    const picked = this.selected.value;
    if (picked.length > 0) return picked;
    return this.focus.value ? [this.focus.value] : [];
  }

  /** Fold or unfold a changelist. A folded one still names its number. */
  toggleFold(id: string): void {
    const list = this.folded.value;
    this.folded.value = list.includes(id) ? list.filter((one) => one !== id) : [...list, id];
  }

  /** A changelist's tick box: tick everything in it or untick everything. */
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

  /** Set up a list. It is returned — the selection is moved into it straight away. */
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

  /** Revert files to the commit. Asking for consent is the panel's job. */
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

  /**
   * Turn `--amend` on or off.
   *
   * Turned on — the message of the commit being edited arrives in the field: that is
   * exactly what the user is about to add to, and typing it again would be work that
   * should not exist. Turned off — we bring back the previous one, if what was put in
   * has been left untouched.
   */
  async toggleAmend(): Promise<void> {
    const on = !this.amend.value;
    this.amend.value = on;
    if (on) {
      this.beforeAmend = this.message.value;
      const { text } = await this.remote.lastMessage();
      if (!this.amend.value) return;       if (text === '') return;
      this.filledByAmend = text;
      this.message.value = text;
      return;
    }
    if (this.filledByAmend !== null && this.message.value === this.filledByAmend) {
      this.message.value = this.beforeAmend;
    }
    this.filledByAmend = null;
  }

  /** Tick a file of a shelf entry, or untick it. */
  toggleShelfFile(id: string, path: string): void {
    const picked = this.shelfPicked.value[id] ?? [];
    const next = picked.includes(path) ? picked.filter((one) => one !== path) : [...picked, path];
    this.shelfPicked.value = { ...this.shelfPicked.value, [id]: next };
  }

  /** The whole entry's tick box: tick all its files or untick them all. */
  toggleShelfItem(id: string): void {
    const item = this.shelf.value.find((one) => one.id === id);
    if (!item) return;
    const picked = this.shelfPicked.value[id] ?? [];
    const all = item.files.length > 0 && picked.length === item.files.length;
    this.shelfPicked.value = { ...this.shelfPicked.value, [id]: all ? [] : [...item.files] };
  }

  /** All, some or none — an entry's tick box shows the STATE of its files. */
  shelfChecked(id: string): 'all' | 'some' | 'none' {
    const item = this.shelf.value.find((one) => one.id === id);
    const picked = this.shelfPicked.value[id] ?? [];
    if (!item || item.files.length === 0 || picked.length === 0) return 'none';
    return picked.length === item.files.length ? 'all' : 'some';
  }

  /**
   * Whether there is anything to apply: without this the button would deceive by being
   * pressable.
   */
  readonly canUnshelve: ReadonlySignal<boolean> = computed(() =>
    Object.values(this.shelfPicked.value).some((files) => files.length > 0),
  );

  /**
   * Apply the ticked things to the tree. The whole entry is ticked — it all goes on;
   * files are ticked — they go on.
   *
   * The shelf does not change in the process, and so the ticks stay where they are:
   * "apply once more" is a legitimate action, and there is no point demanding the ticks
   * be set out again for its sake.
   */
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

  /** A shelf entry's chevron: open its files or fold them back. */
  toggleShelf(id: string): void {
    this.openShelf.value = this.openShelf.value === id ? null : id;
  }

  /**
   * The signature comes from the server: git's config plus the user's replacement, if
   * there is one.
   */
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

  /**
   * Remember the replacement. It matched what git says — then there is no replacement:
   * keeping a copy of its own answer means parting company with it one day.
   */
  saveIdentity(): Promise<void> {
    const name = this.authorName.value.trim();
    const email = this.authorEmail.value.trim();
    const own = {
      name: name === this.gitIdentity.name ? '' : name,
      email: email === this.gitIdentity.email ? '' : email,
    };
    return this.remote.identityWrite(own).then(() => undefined);
  }

  /** The draft message comes from the server, together with the shelf and the lists. */
  async loadDraft(): Promise<void> {
    try {
      const { text } = await this.remote.draftRead();
      if (this.message.value === '') this.message.value = text;
    } catch {}
  }

  /**
   * Remember the draft. The delay is held by whoever calls: a file per letter is a bad
   * trade.
   */
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

  /**
   * Put aside. The files and the name come from OUTSIDE: the name is asked for by a
   * modal, and the files may be either ticked or selected — "put this aside" from a
   * row's menu must not depend on the tick boxes.
   */
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

  /**
   * The patch went on WITH AN ARGUMENT: the merge screen will open by itself — the
   * session is set up by the server — but the panel is obliged to say that the press
   * ended not in silence but in an argument, and that it is waiting to be sorted out.
   */
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

  /** An entry's patch text: showing what is put aside is what needs it. */
  patchOf(id: string): Promise<{ text: string }> {
    return this.remote.patch({ id });
  }

  /** Put a file's text down: reverting a hunk in a file that is not open. */
  writeFile(path: string, text: string): Promise<{ error: string | null } | null> {
    return this.working(() => this.remote.write({ path, text }));
  }

  /** The "how it was" for a file put aside: the revision the patch was taken off. */
  baseOf(id: string, path: string): Promise<{ text: string | null }> {
    return this.remote.patchBase({ id, path });
  }

  /**
   * One ritual for every action: busy — we said so, an error — we showed it.
   *
   * The grumble lives IN THE PANEL rather than as a notification on top: the user is
   * looking here, and the answer to their press has to be where the button is.
   */
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
