import { batch, signal } from '@preact/signals';
import type { DirSuggestion } from '@ide/protocol';
import { current, openProject, rpc } from './session.js';

export const projectsVisible = signal(false);

export const pathDraft = signal('');
export const pathSuggestions = signal<DirSuggestion[]>([]);
export const pathSelected = signal(-1);

let queryToken = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showProjects(): void {
  batch(() => {
    projectsVisible.value = true;
    pathSelected.value = -1;
  });
  void refreshSuggestions(pathDraft.value);
}

export function hideProjects(): void {
  if (!current.value) return;
  batch(() => {
    projectsVisible.value = false;
    pathSuggestions.value = [];
    pathSelected.value = -1;
  });
}

export function setPathDraft(value: string): void {
  batch(() => {
    pathDraft.value = value;
    pathSelected.value = -1;
  });
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshSuggestions(value);
  }, 70);
}

export function moveSuggestion(delta: number): void {
  const total = pathSuggestions.value.length;
  if (total === 0) return;
  const at = pathSelected.value;
  const next = at + delta;
  pathSelected.value = next < -1 ? total - 1 : next >= total ? -1 : next;
}

export function completeSuggestion(): void {
  const pick = pathSuggestions.value[pathSelected.value] ?? pathSuggestions.value[0];
  if (!pick) return;
  batch(() => {
    pathDraft.value = `${pick.path}/`;
    pathSelected.value = -1;
  });
  void refreshSuggestions(pathDraft.value);
}

export function acceptPath(): void {
  const pick = pathSuggestions.value[pathSelected.value];
  const root = pick ? pick.path : pathDraft.value.trim();
  if (root === '') return;
  void openProject(root).then(() => {
    if (current.value) hideProjects();
  });
}

async function refreshSuggestions(prefix: string): Promise<void> {
  const token = ++queryToken;
  try {
    const list = await rpc.call('workspace.browse', { prefix });
    if (token !== queryToken) return;
    pathSuggestions.value = list;
  } catch {
    if (token === queryToken) pathSuggestions.value = [];
  }
}
