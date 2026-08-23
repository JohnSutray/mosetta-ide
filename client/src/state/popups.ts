import { signal } from '@preact/signals';

export interface OpenPopup {
  id: string;
  close: () => void;
  el?: HTMLElement | null;
  layer?: boolean;
  over?: string;
}

export const stack = signal<OpenPopup[]>([]);

const cameFrom = new Map<string, HTMLElement>();

export function enter(popup: OpenPopup): void {
  const top = stack.value[stack.value.length - 1];
  if (top && top.id === popup.id && top.close === popup.close) return;

  if (!popup.layer) {
    for (const item of stack.value) {
      if (item.layer || item.id === popup.id || item.id === popup.over) continue;
      item.close();
    }
  }
  const from = active();
  if (from && !cameFrom.has(popup.id)) cameFrom.set(popup.id, from);

  stack.value = [...stack.value.filter((item) => item.id !== popup.id), popup];
}

export function leave(id: string): void {
  const closing = stack.value.find((item) => item.id === id);
  stack.value = stack.value.filter((item) => item.id !== id);
  const from = cameFrom.get(id);
  cameFrom.delete(id);
  if (from) restore(from, closing?.el ?? null);
}

function restore(from: HTMLElement, popup: HTMLElement | null): void {
  const decide = () => {
    if (!from.isConnected) return;
    const now = active();
    const nobody =
      !now || now === document.body || !now.isConnected || (popup ? popup.contains(now) : false);
    if (!nobody) return;
    from.focus({ preventScroll: true });
  };
  if (typeof queueMicrotask === 'function') queueMicrotask(decide);
  else decide();
}

function active(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const el = document.activeElement as HTMLElement | null;
  return el && typeof el.focus === 'function' ? el : null;
}

export function closeTop(): boolean {
  const top = stack.value[stack.value.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export const anyPopupOpen = () => stack.value.length > 0;
