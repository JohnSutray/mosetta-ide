import { signal } from '@preact/signals';

export interface OpenPopup {
  id: string;
  close: () => void;
}

export const stack = signal<OpenPopup[]>([]);

export function enter(popup: OpenPopup): void {
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
