import { geometry } from './geometry.js';
import { host, updateHost, type UiHost } from './host.js';
import { activeMenu } from './menu-state.js';
import { activePick } from './pick.js';
import { popups } from './popups.js';
import { tips } from './tips.js';

export class Windows {
  readonly popups = popups;
  readonly tips = tips;
  readonly geometry = geometry;
  readonly activePick = activePick;
  readonly activeMenu = activeMenu;
  readonly host = host;

  updateHost(part: Partial<UiHost>): void {
    updateHost(part);
  }
}

export const windows = new Windows();
