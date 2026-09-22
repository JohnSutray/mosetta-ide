import type { WorkspacesAccess } from '@mosetta/ide-api/client';
import { batch, effect, signal } from '@preact/signals';
import type { DirSuggestion, RecentProject } from './types.js';

/** The picker's server half — it arrives through the constructor. */
export interface ProjectsRemote {
  roots(): Promise<DirSuggestion[]>;
  recent(): Promise<RecentProject[]>;
  browse(prefix: string, options?: { depth?: number; limit?: number }): Promise<DirSuggestion[]>;
  remember(): Promise<void>;
}

/**
 * The project picker.
 *
 * Three things, top to bottom, and the order answers the frequency: first the LIST of
 * recent ones — they are reached in one click; then the path field with an Open button
 * on the same row; then the directory tree, by which a path is typed through poking.
 *
 * The main rule: **a click in the tree does not open a project.** A click only fills
 * the path into the field. Otherwise an accidental opening would happen every time
 * somebody simply walked the tree — and opening a project is a reload of all the state,
 * the language server and the index.
 *
 * One class per one WINDOW: the directory tree and the path field look like two things,
 * but their state is shared — poking a directory writes into the field, typing in the
 * field dismisses the suggestions. Cutting them apart would mean setting up a
 * conversation between the halves that does not exist now.
 */
export class Projects {
  /**
   * The picker is a POPUP rather than a replacement for the tree.
   *
   * It used to occupy the tree's column, and that was a lie about place: choosing a
   * project is not a "view of the tree" but a separate action over everything, like
   * search and branches. The tree disappeared in the process, and the only way to get
   * it back was the same button — while a human who had clicked a project stayed in the
   * menu and could not tell whether anything had happened.
   */
  readonly visible = signal(false);
  readonly draft = signal('');

  /** The roots: the home directory and the drive root. */
  readonly roots = signal<DirSuggestion[]>([]);
  /** A path to its subdirectories. Lazily, but the first levels arrive at once. */
  readonly children = signal<Map<string, DirSuggestion[]>>(new Map());
  /** Which directories are expanded. */
  readonly expanded = signal<Set<string>>(new Set());
  /**
   * Directories somebody asked to see IN FULL.
   *
   * The list from the server is complete, but drawing five thousand rows on one click
   * means hanging the tab. So the first hundred are shown at once and the rest hides
   * behind a "another N" row — a truncation that is VISIBLE.
   */
  readonly showingAll = signal<Set<string>>(new Set());
  /** How many rows of one level we show before being asked. */
  readonly page = 100;

  /**
   * The list of the current directory's contents, over the field. It does not pop up by
   * itself: by itself it would cover the tree on every letter. It is called by hand.
   */
  readonly suggestOpen = signal(false);
  readonly suggestions = signal<DirSuggestion[]>([]);
  /** −1 means nothing is highlighted: Enter will open exactly what was typed by hand. */
  readonly selected = signal(-1);

  readonly recent = signal<RecentProject[]>([]);

  /** An answer to an outdated request is thrown away: people type faster than it flies. */
  private token = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly remote: ProjectsRemote,
    /** Workspaces are a core service: what the tab has, and how to change it. */
    private readonly workspaces: WorkspacesAccess,
  ) {
    effect(() => {
      if (this.workspaces.current.value) this.hide();
      else this.show();
    });
  }

  show(): void {
    this.visible.value = true;
    void this.load();
  }

  toggle(): void {
    if (this.visible.value) this.hide();
    else this.show();
  }

  hide(): void {
    if (!this.workspaces.current.value) return;
    batch(() => {
      this.visible.value = false;
      this.closeSuggest();
    });
  }

  /**
   * The tree and the history. Called on showing — a tab may have been hanging around
   * for hours.
   */
  async load(): Promise<void> {
    try {
      const [roots, history] = await Promise.all([this.remote.roots(), this.remote.recent()]);
      const children = new Map(this.children.value);
      for (const root of roots) this.absorb(children, root);
      batch(() => {
        this.roots.value = roots;
        this.children.value = children;
        this.recent.value = history;
        if (roots[0] && this.expanded.value.size === 0) {
          this.expanded.value = new Set([roots[0].path]);
        }
      });
    } catch {}
  }

  showAllIn(dir: string): void {
    const next = new Set(this.showingAll.value);
    next.add(dir);
    this.showingAll.value = next;
  }

  /**
   * Poking a directory: the path goes into the field and the directory expands. There
   * is no opening of a project here and there cannot be — see the rule at the top.
   */
  pickDir(item: DirSuggestion): void {
    batch(() => {
      this.draft.value = item.path;
      this.closeSuggest();
      const open = new Set(this.expanded.value);
      if (open.has(item.path)) open.delete(item.path);
      else open.add(item.path);
      this.expanded.value = open;
    });
    if (!this.children.value.has(item.path)) void this.loadChildren(item.path);
  }

  setDraft(value: string): void {
    batch(() => {
      this.draft.value = value;
      this.selected.value = -1;
    });
    if (!this.suggestOpen.value) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refreshSuggestions(value);
    }, 70);
  }

  /** Cmd+Space: show what lies in the current directory. */
  openSuggest(): void {
    this.suggestOpen.value = true;
    void this.refreshSuggestions(this.draft.value);
  }

  closeSuggest(): void {
    batch(() => {
      this.suggestOpen.value = false;
      this.suggestions.value = [];
      this.selected.value = -1;
    });
  }

  moveSuggestion(delta: number): void {
    const total = this.suggestions.value.length;
    if (total === 0) return;
    const next = this.selected.value + delta;
    this.selected.value = next < -1 ? total - 1 : next >= total ? -1 : next;
  }

  /** Tab: complete the suggestion into the field and look inside it. */
  complete(): void {
    const pick = this.suggestions.value[this.selected.value] ?? this.suggestions.value[0];
    if (!pick) return;
    batch(() => {
      this.draft.value = `${pick.path}/`;
      this.selected.value = -1;
    });
    void this.refreshSuggestions(this.draft.value);
  }

  /**
   * Enter, or the Open button. If something is highlighted among the suggestions, we
   * complete first: Enter on a list means "chosen" rather than "off we go".
   */
  accept(): void {
    if (this.suggestOpen.value && this.selected.value >= 0) {
      this.complete();
      return;
    }
    this.choose(this.draft.value.trim());
  }

  /**
   * A click on a history row. Three cases, and they end IDENTICALLY — the picker closes
   * and the user sees the project's tree.
   *
   * The cases used to behave differently: a live workspace switched and left the picker
   * on screen, while a click on the project that was already open did nothing at all.
   * From the outside that looked like "I pressed it and could not tell whether anything
   * happened" — the choice had already been made, and there was nobody to say so.
   */
  choose(root: string, liveId?: string): void {
    if (root === '' && !liveId) return;
    if (liveId && this.workspaces.current.value?.id === liveId) {
      this.hide();
      return;
    }
    const going = liveId ? this.workspaces.switchTo(liveId) : this.workspaces.open(root);
    void going.then(async () => {
      if (!this.workspaces.current.value) return;
      if (!liveId) await this.remote.remember().catch(() => undefined);
      this.hide();
      void this.load();
    });
  }

  /** Flatten the nested answers into a plain map of path to children. */
  private absorb(map: Map<string, DirSuggestion[]>, item: DirSuggestion): void {
    if (!item.children) return;
    map.set(item.path, item.children);
    for (const child of item.children) this.absorb(map, child);
  }

  private async loadChildren(dir: string): Promise<void> {
    const next = new Map(this.children.value);
    try {
      next.set(dir, await this.remote.browse(`${dir}/`, { depth: 1 }));
    } catch {
      next.set(dir, []);
    }
    this.children.value = next;
  }

  private async refreshSuggestions(prefix: string): Promise<void> {
    const token = ++this.token;
    try {
      const list = await this.remote.browse(prefix, { limit: 24 });
      if (token !== this.token) return;
      this.suggestions.value = list;
    } catch {
      if (token === this.token) this.suggestions.value = [];
    }
  }
}
