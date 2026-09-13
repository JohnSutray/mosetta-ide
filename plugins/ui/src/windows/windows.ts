import { signal } from '@preact/signals';
import type { Mount } from '@mosetta/ide-api/client';
import type { KeyContext } from '@mosetta/ide-plugin-keymap';
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
  readonly popups: Popups;
  readonly tips = new Tips();
  readonly geometry: Geometry;
  readonly activePick = signal<PickApi | null>(null);
  readonly activeMenu = signal<MenuApi | null>(null);

  constructor(
    remember: Remember,
    private readonly captures: () => readonly KeyCapture[],
    mount: Pick<Mount, 'size' | 'idle'>,
  ) {
    this.popups = new Popups((el) => mount.idle(el));
    this.geometry = new Geometry(remember, mount.size);
  }

  catchesKeys(context: KeyContext): boolean {
    return this.captures().some((one) => one.catches(context));
  }
}
