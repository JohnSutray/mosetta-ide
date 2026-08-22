import { batch, signal } from '@preact/signals';
import type { DirSuggestion, RecentProject } from '@ide/protocol';
import { current, openProject, rpc, switchProject } from './session.js';

export const projectsVisible = signal(false);

export const pathDraft = signal('');

export const pickerRoots = signal<DirSuggestion[]>([]);
export const pickerChildren = signal<Map<string, DirSuggestion[]>>(new Map());
export const pickerAll = signal<Set<string>>(new Set());

export const PICKER_PAGE = 100;

export function showAllIn(dir: string): void {
  const next = new Set(pickerAll.value);
  next.add(dir);
  pickerAll.value = next;
}
export const pickerOpen = signal<Set<string>>(new Set());

export const suggestOpen = signal(false);
export const pathSuggestions = signal<DirSuggestion[]>([]);
export const pathSelected = signal(-1);

export const recent = signal<RecentProject[]>([]);

let queryToken = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

export function showProjects(): void {
  projectsVisible.value = true;
  void loadPicker();
}

export function toggleProjects(): void {
  if (projectsVisible.value) hideProjects();
  else showProjects();
}

export function hideProjects(): void {
  if (!current.value) return;
  batch(() => {
    projectsVisible.value = false;
    closeSuggest();
  });
}

export async function loadPicker(): Promise<void> {
  try {
    const [roots, history] = await Promise.all([
      rpc.call('workspace.roots', null),
      rpc.call('workspace.recent', null),
    ]);
    const children = new Map(pickerChildren.value);
    for (const root of roots) absorb(children, root);
    batch(() => {
      pickerRoots.value = roots;
      pickerChildren.value = children;
      recent.value = history;
      if (roots[0] && pickerOpen.value.size === 0) {
        pickerOpen.value = new Set([roots[0].path]);
      }
    });
  } catch {}
}

function absorb(map: Map<string, DirSuggestion[]>, item: DirSuggestion): void {
  if (!item.children) return;
  map.set(item.path, item.children);
  for (const child of item.children) absorb(map, child);
}

export function pickDir(item: DirSuggestion): void {
  batch(() => {
    pathDraft.value = item.path;
    closeSuggest();
    const open = new Set(pickerOpen.value);
    if (open.has(item.path)) open.delete(item.path);
    else open.add(item.path);
    pickerOpen.value = open;
  });
  if (!pickerChildren.value.has(item.path)) void loadChildren(item.path);
}

async function loadChildren(dir: string): Promise<void> {
  try {
    const kids = await rpc.call('workspace.browse', { prefix: `${dir}/`, depth: 1 });
    const next = new Map(pickerChildren.value);
    next.set(dir, kids);
    pickerChildren.value = next;
  } catch {
    const next = new Map(pickerChildren.value);
    next.set(dir, []);
    pickerChildren.value = next;
  }
}

export function setPathDraft(value: string): void {
  batch(() => {
    pathDraft.value = value;
    pathSelected.value = -1;
  });
  if (!suggestOpen.value) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void refreshSuggestions(value);
  }, 70);
}

export function openSuggest(): void {
  suggestOpen.value = true;
  void refreshSuggestions(pathDraft.value);
}

export function closeSuggest(): void {
  batch(() => {
    suggestOpen.value = false;
    pathSuggestions.value = [];
    pathSelected.value = -1;
  });
}

export function moveSuggestion(delta: number): void {
  const total = pathSuggestions.value.length;
  if (total === 0) return;
  const next = pathSelected.value + delta;
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
  if (suggestOpen.value && pathSelected.value >= 0) {
    completeSuggestion();
    return;
  }
  open(pathDraft.value.trim());
}

export function chooseProject(root: string, liveId?: string): void {
  if (root === '' && !liveId) return;
  if (liveId && current.value?.id === liveId) {
    hideProjects();
    return;
  }
  const going = liveId ? switchProject(liveId) : openProject(root);
  void going.then(() => {
    if (!current.value) return;
    hideProjects();
    void loadPicker();
  });
}

function open(root: string): void {
  chooseProject(root);
}

async function refreshSuggestions(prefix: string): Promise<void> {
  const token = ++queryToken;
  try {
    const list = await rpc.call('workspace.browse', { prefix, limit: 24 });
    if (token !== queryToken) return;
    pathSuggestions.value = list;
  } catch {
    if (token === queryToken) pathSuggestions.value = [];
  }
}
