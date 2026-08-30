import { doc, rpc } from './session.js';
import { signal } from '@preact/signals';
import type { Visit } from '@ide/protocol';

const FAR = 12;

const LIMIT = 30;

export const visits = signal<Visit[]>([]);
export const visitAt = signal(-1);

let walking = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function canGoBack(): boolean {
  return visitAt.value > 0;
}

export function canGoForward(): boolean {
  return visitAt.value >= 0 && visitAt.value < visits.value.length - 1;
}

export async function loadVisits(): Promise<void> {
  try {
    const list = await rpc.call('visits.get', null);
    visits.value = list;
    visitAt.value = list.length - 1;
  } catch {
    visits.value = [];
    visitAt.value = -1;
  }
}

export function forgetVisits(): void {
  visits.value = [];
  visitAt.value = -1;
}

export function visit(path: string, line: number, character = 0): void {
  if (walking) return;
  const next = nextVisits(visits.value, visitAt.value, path, line, character);
  if (!next) return;
  visits.value = next.list;
  visitAt.value = next.at;
  schedule();
}

export function nextVisits(
  list: Visit[],
  at: number,
  path: string,
  line: number,
  character = 0,
  far = FAR,
  limit = LIMIT,
): { list: Visit[]; at: number } | null {
  const here = list[at];
  if (here && here.path === path && Math.abs(here.line - line) < far) {
    if (here.line === line && (here.character ?? 0) === character) return null;
    const updated = [...list];
    updated[at] = { path, line, character };
    return { list: updated, at };
  }
  const kept = list.slice(0, at + 1).slice(-(limit - 1));
  const next = [...kept, { path, line, character }];
  return { list: next, at: next.length - 1 };
}

export function goBack(): void {
  if (!canGoBack()) return;
  void jump(visitAt.value - 1);
}

export function goForward(): void {
  if (!canGoForward()) return;
  void jump(visitAt.value + 1);
}

async function jump(to: number): Promise<void> {
  const target = visits.value[to];
  if (!target) return;
  walking = true;
  visitAt.value = to;
  try {
    if (doc.open.peek()?.path !== target.path) await doc.openAt(target.path);
    doc.reveal(target.path, target.line, target.character);
  } finally {
    setTimeout(() => {
      walking = false;
    }, 400);
  }
}

function schedule(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void rpc.call('visits.set', { visits: visits.peek() }).catch(() => undefined);
  }, 800);
}

export function installMouseNav(): () => void {
  const noMenu = (event: Event) => event.preventDefault();
  window.addEventListener('contextmenu', noMenu, { capture: true });

  const onDown = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) goBack();
    else goForward();
  };
  const swallow = (event: MouseEvent) => {
    if (event.button === 3 || event.button === 4) event.preventDefault();
  };
  window.addEventListener('mousedown', onDown, { capture: true });
  window.addEventListener('auxclick', swallow, { capture: true });
  window.addEventListener('mouseup', swallow, { capture: true });
  return () => {
    window.removeEventListener('contextmenu', noMenu, { capture: true });
    window.removeEventListener('mousedown', onDown, { capture: true });
    window.removeEventListener('auxclick', swallow, { capture: true });
    window.removeEventListener('mouseup', swallow, { capture: true });
  };
}
