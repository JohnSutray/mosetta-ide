import { batch, computed, signal } from '@preact/signals';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitFileState,
  GitState,
  PushPreview,
} from '@ide/protocol';
import { complain, rpc } from './session.js';
import { notify, settle } from './notifications.js';
import { fuzzy, type FuzzyHit } from '../ui/fuzzy.js';
import { t } from '../i18n/index.js';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

export const gitState = signal<GitState>(EMPTY);
export const gitBranches = signal<GitBranch[]>([]);

export const branchesOpen = signal(false);
export const branchSelected = signal(0);
export const branchFilter = signal('');
export const branchMenu = signal<{ name: string; x: number; y: number } | null>(null);
export const branchPrompt = signal<{ action: GitAction; value: string } | null>(null);

export const gitRunning = signal<GitAction | null>(null);
export const gitOutput = signal('');

const OUTPUT_LIMIT = 64 * 1024;

export const pushOpen = signal(false);
export const pushPreview = signal<PushPreview | null>(null);
export const pushForce = signal(false);

export const pushSelected = signal<string | null>(null);
export const pushChanges = signal<GitChange[]>([]);

let changesToken = 0;

export type TreeTint = 'modified' | 'added' | 'conflict';

const FILE_TINT: Partial<Record<GitFileState, TreeTint>> = {
  modified: 'modified',
  added: 'added',
  untracked: 'added',
  conflict: 'conflict',
};

export const gitTint = computed<Map<string, TreeTint>>(() => {
  const out = new Map<string, TreeTint>();
  for (const [path, state] of Object.entries(gitState.value.files)) {
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

export function resetGit(): void {
  batch(() => {
    gitState.value = EMPTY;
    gitBranches.value = [];
    branchesOpen.value = false;
    branchPrompt.value = null;
  });
}

export async function refreshGit(): Promise<void> {
  try {
    const [state, branches] = await Promise.all([
      rpc.call('git.state', null),
      rpc.call('git.branches', null),
    ]);
    batch(() => {
      gitState.value = state;
      gitBranches.value = branches;
    });
  } catch {}
}

export function openBranches(): void {
  if (!gitState.value.repo) {
    complain(t('branches.notRepo'));
    return;
  }
  batch(() => {
    branchesOpen.value = true;
    branchFilter.value = '';
    branchMenu.value = null;
    branchSelected.value = Math.max(
      0,
      gitBranches.value.findIndex((branch) => branch.current),
    );
    branchPrompt.value = null;
  });
  void refreshGit();
}

export async function openPush(): Promise<void> {
  if (!gitState.value.repo) {
    complain(t('branches.notRepo'));
    return;
  }
  batch(() => {
    pushOpen.value = true;
    pushForce.value = false;
    pushPreview.value = null;
    pushSelected.value = null;
    pushChanges.value = [];
    gitOutput.value = '';
  });
  try {
    pushPreview.value = await rpc.call('git.outgoing', null);
    await loadChanges();
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}

export function clearCommit(): void {
  if (pushSelected.value === null) return;
  pushSelected.value = null;
  void loadChanges();
}

export function selectCommit(short: string): void {
  pushSelected.value = pushSelected.value === short ? null : short;
  void loadChanges();
}

async function loadChanges(): Promise<void> {
  const commit = pushSelected.value;
  const token = ++changesToken;
  try {
    const list = await rpc.call('git.changes', commit ? { commit } : {});
    if (token === changesToken) pushChanges.value = list;
  } catch {
    if (token === changesToken) pushChanges.value = [];
  }
}

export function closePush(): void {
  batch(() => {
    pushOpen.value = false;
    pushPreview.value = null;
  });
}

export async function doPush(): Promise<void> {
  const branch = pushPreview.value?.branch ?? null;
  const ok = await runGit(pushForce.value ? 'force-push' : 'push', branch ?? undefined);
  if (ok) closePush();
}

export function closeBranches(): void {
  if (branchMenu.value) {
    branchMenu.value = null;
    return;
  }
  if (branchPrompt.value) {
    branchPrompt.value = null;
    return;
  }
  branchesOpen.value = false;
}

export function setBranchFilter(value: string): void {
  batch(() => {
    branchFilter.value = value;
    branchMenu.value = null;
    branchSelected.value = 0;
  });
}

const MENU_W = 200;
const MENU_H = 230;

export function openMenuForSelected(): void {
  const branch = selectedBranch.value;
  if (!branch) return;
  const row = document.querySelector('.branch-row.is-current');
  if (!row) return;
  openBranchMenu(branch.name, row.getBoundingClientRect());
}

export function openBranchMenu(name: string, rect: DOMRect): void {
  if (branchMenu.value?.name === name) {
    branchMenu.value = null;
    return;
  }
  const fitsRight = rect.right + MENU_W < window.innerWidth;
  branchMenu.value = {
    name,
    x: fitsRight ? rect.right - 8 : Math.max(8, rect.right - MENU_W),
    y: Math.min(rect.top, Math.max(8, window.innerHeight - MENU_H)),
  };
}

export function moveBranch(delta: number): void {
  const total = shownBranches.value.length;
  if (total === 0) return;
  branchSelected.value = (branchSelected.value + delta + total) % total;
  batch(() => {
    branchPrompt.value = null;
    branchMenu.value = null;
  });
}

export const selectedCommit = computed(() => {
  const short = pushSelected.value;
  const preview = pushPreview.value;
  if (!short || !preview) return null;
  return (
    [...preview.local, ...preview.remote, ...preview.common].find(
      (commit) => commit.short === short,
    ) ?? null
  );
});

export const shownBranches = computed<GitBranch[]>(() => {
  const query = branchFilter.value.trim();
  if (query === '') return gitBranches.value;
  return gitBranches.value
    .map((branch) => ({ branch, hit: fuzzy(branch.name, query) }))
    .filter((row): row is { branch: GitBranch; hit: FuzzyHit } => row.hit !== null)
    .sort((a, b) => b.hit.score - a.hit.score)
    .map((row) => row.branch);
});

export const selectedBranch = computed(() => shownBranches.value[branchSelected.value] ?? null);

export type BranchRow =
  | { kind: 'head'; title: string }
  | { kind: 'remote'; title: string }
  | { kind: 'branch'; branch: GitBranch; at: number; label: string };

export const branchRows = computed<BranchRow[]>(() => {
  const rows: BranchRow[] = [];
  let seenLocal = false;
  let seenRemote = false;
  let currentRemote = '';

  shownBranches.value.forEach((branch, at) => {
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

export function askName(action: GitAction): void {
  const branch = selectedBranch.value;
  if (!branch) return;
  branchPrompt.value = { action, value: action === 'rename' ? branch.name : '' };
}

export async function gitDo(action: GitAction, name?: string): Promise<void> {
  await runGit(action, selectedBranch.value?.name, name);
}

function doneText(action: GitAction, branch: string | null, name?: string): string {
  const of = name ?? branch ?? '';
  switch (action) {
    case 'fetch':
      return t('git.fetched');
    case 'pull':
      return t('git.pulled', { branch: branch ?? '' });
    case 'push':
    case 'force-push':
      return t('git.pushed', { branch: of });
    case 'checkout':
      return t('git.checkedOut', { branch: of });
    case 'merge':
      return t('git.merged', { branch: of });
    case 'create':
      return t('git.created', { branch: of });
    case 'rename':
      return t('git.renamed', { branch: of });
    case 'delete':
    case 'force-delete':
      return t('git.deleted', { branch: of });
    default:
      return t('git.done', { action });
  }
}

async function runGit(action: GitAction, branchName?: string, name?: string): Promise<boolean> {
  if (gitRunning.value) return false;
  const branch = branchName ?? null;
  const note = notify(t(`branches.${action === 'force-push' ? 'push' : action}`) + '…', 'work');
  batch(() => {
    gitRunning.value = action;
    gitOutput.value = '';
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
    batch(() => {
      branchPrompt.value = null;
      if (action === 'checkout') branchesOpen.value = false;
    });
    await refreshGit();
    return true;
  } catch (err) {
    settle(note, err instanceof Error ? err.message : String(err), 'error');
    return false;
  } finally {
    gitRunning.value = null;
  }
}

rpc.on('git.output', ({ chunk }) => {
  const text = (gitOutput.value + chunk.replace(/\r(?!\n)/g, '\n')).slice(-OUTPUT_LIMIT);
  gitOutput.value = text;
});

rpc.on('git.state', (state) => {
  gitState.value = state;
  if (branchesOpen.value) void refreshGit();
});
