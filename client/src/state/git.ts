import { batch, computed, signal } from '@preact/signals';
import type { GitAction, GitBranch, GitFileState, GitState, PushPreview } from '@ide/protocol';
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

export const pushOpen = signal(false);
export const pushPreview = signal<PushPreview | null>(null);
export const pushForce = signal(false);

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

export async function openPush(): Promise<void> {
  if (!gitState.value.repo) {
    complain('Проект не под git');
    return;
  }
  batch(() => {
    pushOpen.value = true;
    pushForce.value = false;
    pushPreview.value = null;
    gitOutput.value = '';
  });
  try {
    pushPreview.value = await rpc.call('git.outgoing', null);
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
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
  await runGit(action, selectedBranch.value?.name, name);
}

async function runGit(action: GitAction, branchName?: string, name?: string): Promise<boolean> {
  if (gitRunning.value) return false;
  const branch = branchName ?? null;
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
      complain(error.split('\n')[0] ?? error);
      return false;
    }
    say(`git ${action}${name ? ` ${name}` : branch ? ` ${branch}` : ''} — готово`);
    batch(() => {
      branchPrompt.value = null;
      if (action === 'checkout') branchesOpen.value = false;
    });
    await refreshGit();
    return true;
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
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
