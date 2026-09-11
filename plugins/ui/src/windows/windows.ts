import { signal } from '@preact/signals';
import type { KeyContext } from '@ide/protocol';
import { Geometry, type Remember } from './geometry.js';
import type { MenuApi } from './menu-state.js';
import type { PickApi } from './pick.js';
import { Popups } from './popups.js';
import { Tips } from './tips.js';

export interface KeyCapture {
  id: string;
  catches(context: KeyContext): boolean;
}

export class Windows {
  readonly popups = new Popups();
  readonly tips = new Tips();
  readonly geometry: Geometry;
  readonly activePick = signal<PickApi | null>(null);
  readonly activeMenu = signal<MenuApi | null>(null);

  constructor(
    remember: Remember,
    private readonly captures: () => readonly KeyCapture[],
  ) {
    this.geometry = new Geometry(remember);
  }

  catchesKeys(context: KeyContext): boolean {
    return this.captures().some((one) => one.catches(context));
  }
}
