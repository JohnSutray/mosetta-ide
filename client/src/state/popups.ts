import { signal } from '@preact/signals';

export interface OpenPopup {
  id: string;
  close: () => void;
  layer?: boolean;
  over?: string;
}

export const stack = signal<OpenPopup[]>([]);

export function enter(popup: OpenPopup): void {
  const top = stack.value[stack.value.length - 1];
  if (top && top.id === popup.id && top.close === popup.close) return;

  if (!popup.layer) {
    for (const item of stack.value) {
      if (item.layer || item.id === popup.id || item.id === popup.over) continue;
      item.close();
    }
  }
  stack.value = [...stack.value.filter((item) => item.id !== popup.id), popup];
}

export function leave(id: string): void {
  stack.value = stack.value.filter((item) => item.id !== id);
}

export function closeTop(): boolean {
  const top = stack.value[stack.value.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export const anyPopupOpen = () => stack.value.length > 0;
