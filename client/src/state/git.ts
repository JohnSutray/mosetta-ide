import { rpc } from './session.js';
import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitFileState,
  GitState,
  PushPreview,
} from '@ide/protocol';
import { complain, notify, settle } from './notifications.js';
import { fuzzy, type FuzzyHit } from '../ui/fuzzy.js';
import { i18n } from '../i18n/index.js';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

const OUTPUT_LIMIT = 64 * 1024;

export type TreeTint = 'modified' | 'added' | 'conflict';

const FILE_TINT: Partial<Record<GitFileState, TreeTint>> = {
  modified: 'modified',
  added: 'added',
  untracked: 'added',
  conflict: 'conflict',
};

export class Git {
  readonly state = signal<GitState>(EMPTY);
  readonly branches = signal<GitBranch[]>([]);

  readonly running = signal<GitAction | null>(null);
  readonly output = signal('');

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

  constructor() {
    rpc.on('git.output', ({ chunk }) => {
      this.output.value = (this.output.value + chunk.replace(/\r(?!\n)/g, '\n')).slice(
        -OUTPUT_LIMIT,
      );
    });
    rpc.on('git.state', (state) => (this.state.value = state));
  }

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
        rpc.call('git.state', null),
        rpc.call('git.branches', null),
      ]);
      batch(() => {
        this.state.value = state;
        this.branches.value = branches;
      });
    } catch {}
  }

  async run(action: GitAction, branchName?: string, name?: string): Promise<boolean> {
    if (this.running.value) return false;
    const branch = branchName ?? null;
    const note = notify(i18n.t(`branches.${action === 'force-push' ? 'push' : action}`) + '…', 'work');
    batch(() => {
      this.running.value = action;
      this.output.value = '';
    });
    try {
      const { error } = await rpc.call('git.run', {
        action,
        ...(branch ? { branch } : {}),
        ...(name ? { name } : {}),
      });
      if (error) {
        settle(note, error.split('\n')[0] ?? error, 'error');
        return false;
      }
      settle(note, doneText(action, branch, name));
      await this.refresh();
      return true;
    } catch (err) {
      settle(note, err instanceof Error ? err.message : String(err), 'error');
      return false;
    } finally {
      this.running.value = null;
    }
  }
}

export type BranchRow =
  | { kind: 'head'; title: string }
  | { kind: 'remote'; title: string }
  | { kind: 'branch'; branch: GitBranch; at: number; label: string };

const MENU_W = 200;
const MENU_H = 230;

export class BranchesWindow {
  readonly open = signal(false);
  readonly selected = signal(0);
  readonly filter = signal('');
  readonly menu = signal<{ name: string; x: number; y: number } | null>(null);
  readonly prompt = signal<{ action: GitAction; value: string } | null>(null);

  readonly shown: ReadonlySignal<GitBranch[]> = computed(() => {
    const query = this.filter.value.trim();
    if (query === '') return this.git.branches.value;
    return this.git.branches.value
      .map((branch) => ({ branch, hit: fuzzy.find(branch.name, query) }))
      .filter((row): row is { branch: GitBranch; hit: FuzzyHit } => row.hit !== null)
      .sort((a, b) => b.hit.score - a.hit.score)
      .map((row) => row.branch);
  });

  readonly current: ReadonlySignal<GitBranch | null> = computed(
    () => this.shown.value[this.selected.value] ?? null,
  );

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

  constructor(private readonly git: Git) {
    rpc.on('git.state', () => {
      if (this.open.value) void this.git.refresh();
    });
  }

  show(): void {
    if (!this.git.repo) {
      complain(i18n.t('branches.notRepo'));
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

  openMenuHere(): void {
    const branch = this.current.value;
    if (!branch) return;
    const row = document.querySelector('.branch-row.is-current');
    if (!row) return;
    this.openMenu(branch.name, row.getBoundingClientRect());
  }

  openMenu(name: string, rect: DOMRect): void {
    if (this.menu.value?.name === name) {
      this.menu.value = null;
      return;
    }
    const fitsRight = rect.right + MENU_W < window.innerWidth;
    this.menu.value = {
      name,
      x: fitsRight ? rect.right - 8 : Math.max(8, rect.right - MENU_W),
      y: Math.min(rect.top, Math.max(8, window.innerHeight - MENU_H)),
    };
  }

  askName(action: GitAction): void {
    const branch = this.current.value;
    if (!branch) return;
    this.prompt.value = { action, value: action === 'rename' ? branch.name : '' };
  }

  async do(action: GitAction, name?: string): Promise<void> {
    const ok = await this.git.run(action, this.current.value?.name, name);
    if (!ok) return;
    batch(() => {
      this.prompt.value = null;
      if (action === 'checkout') this.open.value = false;
    });
  }

  reset(): void {
    batch(() => {
      this.open.value = false;
      this.prompt.value = null;
      this.menu.value = null;
    });
  }
}

export class PushWindow {
  readonly open = signal(false);
  readonly preview = signal<PushPreview | null>(null);
  readonly force = signal(false);

  readonly selected = signal<string | null>(null);
  readonly changes = signal<GitChange[]>([]);

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

  private token = 0;

  constructor(private readonly git: Git) {}

  async show(): Promise<void> {
    if (!this.git.repo) {
      complain(i18n.t('branches.notRepo'));
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
      this.preview.value = await rpc.call('git.outgoing', null);
      await this.loadChanges();
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
    }
  }

  close(): void {
    batch(() => {
      this.open.value = false;
      this.preview.value = null;
    });
  }

  clear(): void {
    if (this.selected.value === null) return;
    this.selected.value = null;
    void this.loadChanges();
  }

  select(short: string): void {
    this.selected.value = this.selected.value === short ? null : short;
    void this.loadChanges();
  }

  async send(): Promise<void> {
    const branch = this.preview.value?.branch ?? null;
    const ok = await this.git.run(this.force.value ? 'force-push' : 'push', branch ?? undefined);
    if (ok) this.close();
  }

  private async loadChanges(): Promise<void> {
    const commit = this.selected.value;
    const token = ++this.token;
    try {
      const list = await rpc.call('git.changes', commit ? { commit } : {});
      if (token === this.token) this.changes.value = list;
    } catch {
      if (token === this.token) this.changes.value = [];
    }
  }
}

function doneText(action: GitAction, branch: string | null, name?: string): string {
  const of = name ?? branch ?? '';
  switch (action) {
    case 'fetch':
      return i18n.t('git.fetched');
    case 'pull':
      return i18n.t('git.pulled', { branch: branch ?? '' });
    case 'push':
    case 'force-push':
      return i18n.t('git.pushed', { branch: of });
    case 'checkout':
      return i18n.t('git.checkedOut', { branch: of });
    case 'merge':
      return i18n.t('git.merged', { branch: of });
    case 'create':
      return i18n.t('git.created', { branch: of });
    case 'rename':
      return i18n.t('git.renamed', { branch: of });
    case 'delete':
    case 'force-delete':
      return i18n.t('git.deleted', { branch: of });
    default:
      return i18n.t('git.done', { action });
  }
}

export const git = new Git();
export const branchesWindow = new BranchesWindow(git);
export const pushWindow = new PushWindow(git);

export function resetGit(): void {
  git.reset();
  branchesWindow.reset();
}
