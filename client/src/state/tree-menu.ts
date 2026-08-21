import { signal } from '@preact/signals';

export const treeMenu = signal<{ path: string; isDir: boolean; x: number; y: number } | null>(null);

const MENU_W = 210;
const MENU_H = 240;

export function openTreeMenu(path: string, isDir: boolean, x: number, y: number): void {
  treeMenu.value = {
    path,
    isDir,
    x: Math.min(x, Math.max(8, window.innerWidth - MENU_W)),
    y: Math.min(y, Math.max(8, window.innerHeight - MENU_H)),
  };
}

export function closeTreeMenu(): void {
  treeMenu.value = null;
}
