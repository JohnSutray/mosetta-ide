import { signal } from '@preact/signals';

export interface MenuApi {
  next(): void;
  prev(): void;
  accept(): void;
}

export const activeMenu = signal<MenuApi | null>(null);
