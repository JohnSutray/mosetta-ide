import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Ide, Mount } from '@mosetta/ide-api/client';
import type { Fuzzy, FuzzyHit } from '@mosetta/ide-plugin-ui';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitFileState,
  GitState,
  PushPreview,
} from './types.js';

/**
 * What `Git` talks to its server half with.
 *
 * Not `ide.rpc.call('state')` as strings all over the file but named methods: the
 * plugin implements them through `@remote`, and the state classes receive them through
 * the CONSTRUCTOR — so a test substitutes its own without bringing a socket up.
 */
export interface GitRemote {
  state(): Promise<GitState>;
  branches(): Promise<GitBranch[]>;
  outgoing(): Promise<PushPreview>;
  changes(commit?: string): Promise<GitChange[]>;
  run(action: GitAction, branch?: string, name?: string): Promise<{ error: string | null }>;
}

/**
 * git on the client.
 *
 * The state arrives whole as a snapshot and is updated by an event: the server computes
 * it in the background while we only paint. So there is not one `await` on the way to
 * drawing the tree.
 *
 * There are THREE classes here rather than one, or thirty-four exports as there used to
 * be. Three — because these are three different things with different lifetimes: the
 * repository's state lives while the project is open, whereas the two windows live
 * while they are held open. Dumping them into one class would give the same armful,
 * only with a dot in the middle.
 *
 * The windows receive `Git` through the CONSTRUCTOR: they need its state and its
 * ability to call git, but they must not own it.
 */

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {}, moved: {} };

/** How much output we keep: git with `--progress` prints by the kilometre. */
const OUTPUT_LIMIT = 64 * 1024;

/**
 * A row's colour in the tree. Three values, and all three are about a file: blue
 * "changed", green "new", red "conflict".
 */
export type TreeTint = 'modified' | 'added' | 'conflict';

/**
 * A git state to a colour. An unversioned file is painted GREEN, like one added to the
 * index: to a human they are the same thing — "this file is not in the history yet".
 * IDEA had a separate olive shade for "unversioned", but there is no point
 * distinguishing two kinds of newness in the tree: the action for them is one.
 *
 * A deleted file is not in the tree by definition — there is nothing to paint.
 */
const FILE_TINT: Partial<Record<GitFileState, TreeTint>> = {
  modified: 'modified',
  added: 'added',
  untracked: 'added',
  conflict: 'conflict',
};

/**
 * What we know about the repository, and how we call git.
 *
 * Not a word about windows: this state may be shown by anybody, including nobody.
 */
export class Git {
  constructor(
    private readonly remote: GitRemote,
    private readonly ide: Pick<Ide, 'on' | 'working' | 'complain' | 't'>,
  ) {
    this.ide.on('output', (payload) => {
      const { chunk } = payload as { chunk: string };
      this.output.value = (this.output.value + chunk.replace(/\r(?!\n)/g, '\n')).slice(
        -OUTPUT_LIMIT,
      );
    });
    this.ide.on('state', (state) => (this.state.value = state as GitState));
  }

  readonly state = signal<GitState>(EMPTY);
  readonly branches = signal<GitBranch[]>([]);

  /**
   * What is spinning right now and what it is printing.
   *
   * `fetch`, `pull` and `push` go over the network; while they go, the button has to be
   * visibly busy and the output has to run before one's eyes. Otherwise the only output
   * available to a human is "I pressed it and I am waiting", and that is the worst
   * interface there is.
   */
  readonly running = signal<GitAction | null>(null);
  readonly output = signal('');

  /**
   * The colour of every row in the tree, DIRECTORIES included.
   *
   * There is EXACTLY ONE rule for painting a directory: a directory is blue if there is
   * at least one painted file inside it. Not "the strongest status within", not shades
   * — simply "there is something here". A collapsed directory answers one question —
   * whether to look inside or not — and one colour is enough for that.
   */
  readonly tint: ReadonlySignal<Map<string, TreeTint>> = computed(() => {
    const out = new Map<string, TreeTint>();
    for (const [path, state] of Object.entries(this.state.value.files)) {
      const tint = FILE_TINT[state];
      if (!tint) continue;
      out.set(path, tint);
      let at = path.lastIndexOf('/');
      while (at > 0) {
        out.set(path.slice(0, at), 'modified');
        at = path.lastIndexOf('/', at - 1);
      }
    }
    return out;
  });

  /**
   * Whether there is a repository at all. There is not — and half the actions are
   * meaningless.
   */
  get repo(): boolean {
    return this.state.value.repo;
  }

  reset(): void {
    batch(() => {
      this.state.value = EMPTY;
      this.branches.value = [];
    });
  }

  async refresh(): Promise<void> {
    try {
      const [state, branches] = await Promise.all([
        this.remote.state(),
        this.remote.branches(),
      ]);
      batch(() => {
        this.state.value = state;
        this.branches.value = branches;
      });
    } catch {}
  }

  /**
   * Call git and show how it is doing it. The arguments are assembled by the server —
   * only the action's name travels here. The branch is supplied by different callers
   * from different places: the branches popup the chosen one, the push window the
   * current one.
   */
  async run(action: GitAction, branchName?: string, name?: string): Promise<boolean> {
    if (this.running.value) return false;
    const branch = branchName ?? null;
    const done = this.ide.working(this.ide.t(`branches.${action === 'force-push' ? 'push' : action}`) + '…');
    batch(() => {
      this.running.value = action;
      this.output.value = '';
    });
    try {
      const { error } = await this.remote.run(action, branch ?? undefined, name);
      if (error) {
        done(error.split('\n')[0] ?? error, true);
        return false;
      }
      done(this.doneText(action, branch, name));
      await this.refresh();
      return true;
    } catch (err) {
      done(err instanceof Error ? err.message : String(err), true);
      return false;
    } finally {
      this.running.value = null;
    }
  }

  /**
   * What to say on completion. Every action has a phrase of its own, because "fetch
   * fix/typo — done" is a lie: fetch is not about a branch but about the whole remote.
   */
  private doneText(action: GitAction, branch: string | null, name?: string): string {
    const of = name ?? branch ?? '';
    switch (action) {
      case 'fetch':
        return this.ide.t('git.fetched');
      case 'pull':
        return this.ide.t('git.pulled', { branch: branch ?? '' });
      case 'push':
      case 'force-push':
        return this.ide.t('git.pushed', { branch: of });
      case 'checkout':
        return this.ide.t('git.checkedOut', { branch: of });
      case 'merge':
        return this.ide.t('git.merged', { branch: of });
      case 'create':
        return this.ide.t('git.created', { branch: of });
      case 'rename':
        return this.ide.t('git.renamed', { branch: of });
      case 'delete':
      case 'force-delete':
        return this.ide.t('git.deleted', { branch: of });
      default:
        return this.ide.t('git.done', { action });
    }
  }
}

/** A popup row: a section heading, a remote's subheading, or the branch itself. */
export type BranchRow =
  | { kind: 'head'; title: string }
  | { kind: 'remote'; title: string }
  | { kind: 'branch'; branch: GitBranch; at: number; label: string };

/**
 * The menu's approximate width and height: needed so that it does not run off the
 * screen.
 */
const MENU_W = 200;
const MENU_H = 230;

/** The branches popup and the action submenu unfolded inside it. */
export class BranchesWindow {
  readonly open = signal(false);
  readonly selected = signal(0);
  /** A fuzzy filter over the branches — as everywhere in this IDE. */
  readonly filter = signal('');
  /** Where to stick the dropdown action menu: the row's screen coordinates. */
  readonly menu = signal<{ name: string; x: number; y: number } | null>(null);
  /** Which action is currently asking for a name: rename and create. */
  readonly prompt = signal<{ action: GitAction; value: string } | null>(null);

  /**
   * The branches after the filter. It is precisely these the arrows walk and the
   * selection is computed from: otherwise an arrow would travel to a row that is not on
   * screen.
   */
  readonly shown: ReadonlySignal<GitBranch[]> = computed(() => {
    const query = this.filter.value.trim();
    if (query === '') return this.git.branches.value;
    return this.git.branches.value
      .map((branch) => ({ branch, hit: this.fuzzy().find(branch.name, query) }))
      .filter((row): row is { branch: GitBranch; hit: FuzzyHit } => row.hit !== null)
      .sort((a, b) => b.hit.score - a.hit.score)
      .map((row) => row.branch);
  });

  readonly current: ReadonlySignal<GitBranch | null> = computed(
    () => this.shown.value[this.selected.value] ?? null,
  );

  /**
   * The branches with explicit headings:
   *
   * ```
   * local
   * main
   * feature
   * remote
   * origin
   * main
   * ```
   *
   * The headings are unselectable — the same rule as in the double Shift: a heading
   * explains rather than acts. The rows' order matches the order in the list of
   * branches, so the arrows walk exactly as it looks.
   */
  readonly rows: ReadonlySignal<BranchRow[]> = computed(() => {
    const rows: BranchRow[] = [];
    let seenLocal = false;
    let seenRemote = false;
    let currentRemote = '';

    this.shown.value.forEach((branch, at) => {
      if (!branch.remote) {
        if (!seenLocal) {
          rows.push({ kind: 'head', title: 'local' });
          seenLocal = true;
        }
        rows.push({ kind: 'branch', branch, at, label: branch.name });
        return;
      }
      if (!seenRemote) {
        rows.push({ kind: 'head', title: 'remote' });
        seenRemote = true;
      }
      const slash = branch.name.indexOf('/');
      const remote = slash === -1 ? branch.name : branch.name.slice(0, slash);
      const label = slash === -1 ? branch.name : branch.name.slice(slash + 1);
      if (remote !== currentRemote) {
        rows.push({ kind: 'remote', title: remote });
        currentRemote = remote;
      }
      rows.push({ kind: 'branch', branch, at, label });
    });

    return rows;
  });

  constructor(
    private readonly git: Git,
    private readonly ide: Pick<Ide, 'on' | 'complain' | 't'> & { readonly mount: Pick<Mount, 'bounds'> },
    /** Fuzzy search is a field of the widgets plugin. */
    private readonly fuzzy: () => Pick<Fuzzy, 'find'>,
  ) {
    this.ide.on('state', () => {
      if (this.open.value) void this.git.refresh();
    });
  }

  show(): void {
    if (!this.git.repo) {
      this.ide.complain(this.ide.t('branches.notRepo'));
      return;
    }
    batch(() => {
      this.open.value = true;
      this.filter.value = '';
      this.menu.value = null;
      this.selected.value = Math.max(
        0,
        this.git.branches.value.findIndex((branch) => branch.current),
      );
      this.prompt.value = null;
    });
    void this.git.refresh();
  }

  close(): void {
    if (this.menu.value) {
      this.menu.value = null;
      return;
    }
    if (this.prompt.value) {
      this.prompt.value = null;
      return;
    }
    this.open.value = false;
  }

  setFilter(value: string): void {
    batch(() => {
      this.filter.value = value;
      this.menu.value = null;
      this.selected.value = 0;
    });
  }

  move(delta: number): void {
    const total = this.shown.value.length;
    if (total === 0) return;
    this.selected.value = (this.selected.value + delta + total) % total;
    batch(() => {
      this.prompt.value = null;
      this.menu.value = null;
    });
  }

  /**
   * Unfold the menu at the selected row — for the keyboard. Enter and → do the same
   * thing: they show what can be done with the branch.
   */
  openMenuHere(): void {
    const branch = this.current.value;
    if (!branch) return;
    const row = document.querySelector('.branch-row.is-current');
    if (!row) return;
    this.openMenu(branch.name, row.getBoundingClientRect());
  }

  /**
   * Open the action menu at a row: to its right, as in IDEA. If there is no room on the
   * right, then on the left: a menu half of which is off the screen is worse than a
   * menu on the wrong side.
   */
  openMenu(name: string, rect: DOMRect): void {
    if (this.menu.value?.name === name) {
      this.menu.value = null;
      return;
    }
    const edge = this.ide.mount.bounds();
    const fitsRight = rect.right + MENU_W < edge.right;
    this.menu.value = {
      name,
      x: fitsRight ? rect.right - 8 : Math.max(edge.left + 8, rect.right - MENU_W),
      y: Math.min(rect.top, Math.max(edge.top + 8, edge.bottom - MENU_H)),
    };
  }

  askName(action: GitAction): void {
    const branch = this.current.value;
    if (!branch) return;
    this.prompt.value = { action, value: action === 'rename' ? branch.name : '' };
  }

  /** Perform an action on the selected branch and clean up after ourselves. */
  async do(action: GitAction, name?: string): Promise<void> {
    const ok = await this.git.run(action, this.current.value?.name, name);
    if (!ok) return;
    batch(() => {
      this.prompt.value = null;
      if (action === 'checkout') this.open.value = false;
    });
  }

  /** Close everything: the project changed, and there is nothing more to talk about. */
  reset(): void {
    batch(() => {
      this.open.value = false;
      this.prompt.value = null;
      this.menu.value = null;
    });
  }
}

/**
 * The push window. Separate from the branches: a push is not "one more button in a
 * list" but a decision with consequences — especially with the checkbox.
 */
export class PushWindow {
  constructor(
    private readonly git: Git,
    private readonly remote: GitRemote,
    private readonly ide: Pick<Ide, 'complain' | 't'>,
  ) {}

  readonly open = signal(false);
  readonly preview = signal<PushPreview | null>(null);
  readonly force = signal(false);

  /**
   * The selected commit of ours, and the files shown on the left. Nothing selected
   * means we show the whole outgoing diff: that is the answer to "what am I sending",
   * and it is the main question in this window.
   */
  readonly selected = signal<string | null>(null);
  readonly changes = signal<GitChange[]>([]);

  /** The chosen commit whole — its message is shown under the tree. */
  readonly commit: ReadonlySignal<PushPreview['local'][number] | null> = computed(() => {
    const short = this.selected.value;
    const preview = this.preview.value;
    if (!short || !preview) return null;
    return (
      [...preview.local, ...preview.remote, ...preview.common].find(
        (one) => one.short === short,
      ) ?? null
    );
  });

  /**
   * An answer to an outdated request is thrown away: people click faster than git
   * counts.
   */
  private token = 0;

  async show(): Promise<void> {
    if (!this.git.repo) {
      this.ide.complain(this.ide.t('branches.notRepo'));
      return;
    }
    batch(() => {
      this.open.value = true;
      this.force.value = false;
      this.preview.value = null;
      this.selected.value = null;
      this.changes.value = [];
      this.git.output.value = '';
    });
    try {
      this.preview.value = await this.remote.outgoing();
      await this.loadChanges();
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  close(): void {
    batch(() => {
      this.open.value = false;
      this.preview.value = null;
    });
  }

  /** Clear the selection: the whole outgoing diff on the left again. */
  clear(): void {
    if (this.selected.value === null) return;
    this.selected.value = null;
    void this.loadChanges();
  }

  /** A click on one of our commits: select it, or clear the selection. */
  select(short: string): void {
    this.selected.value = this.selected.value === short ? null : short;
    void this.loadChanges();
  }

  /**
   * Send. Force is `--force-with-lease` on the server: the human agreed to overwrite
   * WHAT THEY WERE SHOWN rather than what appeared in the remote later.
   */
  async send(): Promise<void> {
    const branch = this.preview.value?.branch ?? null;
    const ok = await this.git.run(this.force.value ? 'force-push' : 'push', branch ?? undefined);
    if (ok) this.close();
  }

  private async loadChanges(): Promise<void> {
    const commit = this.selected.value;
    const token = ++this.token;
    try {
      const list = await this.remote.changes(commit ?? undefined);
      if (token === this.token) this.changes.value = list;
    } catch {
      if (token === this.token) this.changes.value = [];
    }
  }
}
