import { batch, computed, signal } from '@preact/signals';
import type { GitAction, GitBranch, GitFileState, GitState } from '@ide/protocol';
import { complain, rpc, say } from './session.js';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

export const gitState = signal<GitState>(EMPTY);
export const gitBranches = signal<GitBranch[]>([]);

export const branchesOpen = signal(false);
export const branchSelected = signal(0);
export const branchPrompt = signal<{ action: GitAction; value: string } | null>(null);

const STRENGTH: GitFileState[] = ['conflict', 'modified', 'added', 'deleted', 'untracked'];

export const gitTint = computed<Map<string, GitFileState>>(() => {
  const out = new Map<string, GitFileState>();
  for (const [path, state] of Object.entries(gitState.value.files)) {
    bump(out, path, state);
    let at = path.lastIndexOf('/');
    while (at > 0) {
      bump(out, path.slice(0, at), state);
      at = path.lastIndexOf('/', at - 1);
    }
  }
  return out;
});

function bump(map: Map<string, GitFileState>, key: string, state: GitFileState): void {
  const known = map.get(key);
  if (known && STRENGTH.indexOf(known) <= STRENGTH.indexOf(state)) return;
  map.set(key, state);
}

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

export function askName(action: GitAction): void {
  const branch = selectedBranch.value;
  if (!branch) return;
  branchPrompt.value = { action, value: action === 'rename' ? branch.name : '' };
}

export async function gitDo(action: GitAction, name?: string): Promise<void> {
  const branch = selectedBranch.value;
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
      if (action === 'checkout' || action === 'merge') branchesOpen.value = false;
    });
    await refreshGit();
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}

rpc.on('git.state', (state) => {
  gitState.value = state;
  if (branchesOpen.value) void refreshGit();
});
