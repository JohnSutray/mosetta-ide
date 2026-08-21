import { batch, computed, signal } from '@preact/signals';
import type { GitAction, GitBranch, GitFileState, GitState } from '@ide/protocol';
import { complain, rpc, say } from './session.js';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

export const gitState = signal<GitState>(EMPTY);
export const gitBranches = signal<GitBranch[]>([]);

export const branchesOpen = signal(false);
export const branchSelected = signal(0);
export const branchPrompt = signal<{ action: GitAction; value: string } | null>(null);

export const gitRunning = signal<GitAction | null>(null);
export const gitOutput = signal('');

const OUTPUT_LIMIT = 64 * 1024;

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
    complain('Проект не под git');
    return;
  }
  batch(() => {
    branchesOpen.value = true;
    branchSelected.value = Math.max(
      0,
      gitBranches.value.findIndex((branch) => branch.current),
    );
    branchPrompt.value = null;
  });
  void refreshGit();
}

export function closeBranches(): void {
  if (branchPrompt.value) {
    branchPrompt.value = null;
    return;
  }
  branchesOpen.value = false;
}

export function moveBranch(delta: number): void {
  const total = gitBranches.value.length;
  if (total === 0) return;
  branchSelected.value = (branchSelected.value + delta + total) % total;
  branchPrompt.value = null;
}

export const selectedBranch = computed(() => gitBranches.value[branchSelected.value] ?? null);

export type BranchRow =
  | { kind: 'head'; title: string }
  | { kind: 'remote'; title: string }
  | { kind: 'branch'; branch: GitBranch; at: number; label: string };

export const branchRows = computed<BranchRow[]>(() => {
  const rows: BranchRow[] = [];
  let seenLocal = false;
  let seenRemote = false;
  let currentRemote = '';

  gitBranches.value.forEach((branch, at) => {
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
  if (gitRunning.value) return;
  const branch = selectedBranch.value;
  batch(() => {
    gitRunning.value = action;
    gitOutput.value = '';
  });
  try {
    const { error } = await rpc.call('git.run', {
      action,
      ...(branch ? { branch: branch.name } : {}),
      ...(name ? { name } : {}),
    });
    if (error) {
      complain(error.split('\n')[0] ?? error);
      return;
    }
    say(`git ${action}${name ? ` ${name}` : branch ? ` ${branch.name}` : ''} — готово`);
    batch(() => {
      branchPrompt.value = null;
      if (action === 'checkout') branchesOpen.value = false;
    });
    await refreshGit();
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
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
