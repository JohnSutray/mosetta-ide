import { signal } from '@preact/signals';
import { Geometry } from './geometry.js';
import { NOBODY, type UiHost } from './host.js';
import type { MenuApi } from './menu-state.js';
import type { PickApi } from './pick.js';
import { Popups } from './popups.js';
import { Tips } from './tips.js';

export class Windows {
  private current: UiHost;

  readonly host: UiHost = {
    t: (key, params) => this.current.t(key, params),
    catchesKeys: (context) => this.current.catchesKeys(context),
    keep: (key, value) => this.current.keep(key, value),
    recall: (key, fallback) => this.current.recall(key, fallback),
  };

  readonly popups = new Popups();
  readonly tips = new Tips();
  readonly geometry: Geometry;
  readonly activePick = signal<PickApi | null>(null);
  readonly activeMenu = signal<MenuApi | null>(null);

  constructor(host: UiHost = NOBODY) {
    this.current = host;
    this.geometry = new Geometry(this.host);
  }

  updateHost(part: Partial<UiHost>): void {
    this.current = { ...this.current, ...part };
  }
}
