import { signal } from '@preact/signals';
import type { Mount } from '@mosetta/ide-api/client';
import type { KeyContext } from '@mosetta/ide-plugin-keymap';
import { Geometry, type Remember } from './geometry.js';
import type { MenuApi } from './menu-state.js';
import type { PickApi } from './pick.js';
import { Popups } from './popups.js';
import { Tips } from './tips.js';

/**
 * Who catches keys whole: an entry in the `ui.captures` key. It is put there by the
 * keymap — it knows; the frame asks so as not to promise `Esc` for nothing.
 */
export interface KeyCapture {
  id: string;
  catches(context: KeyContext): boolean;
}

/** The modal Enter says "yes" to. */
export interface Answerable {
  answer(): Promise<void>;
}

/**
 * The windows' state — a field of the widgets plugin.
 *
 * The popup stack, the tooltip under the cursor, the remembered sizes, the active list
 * and menu. It lived as a separate package, then as a core service, but only the
 * widgets and those who draw them use it: the core turned out to have not one question
 * of its own about windows. Neighbours reach it through
 * `ide.getPlugin(UiPlugin).windows`.
 */
export class Windows {
  readonly popups: Popups;
  readonly tips = new Tips();
  readonly geometry: Geometry;
  /** The active list (`pick.*`): the arrows and Enter go to it. */
  readonly activePick = signal<PickApi | null>(null);
  /** The active menu (`menu.*`). */
  readonly activeMenu = signal<MenuApi | null>(null);
  /**
   * The open question modal (`prompt.confirm`). There are never two of them, so one
   * field rather than a stack: the frame puts itself here while it lives.
   */
  readonly asking = signal<Answerable | null>(null);

  constructor(
    remember: Remember,
    private readonly captures: () => readonly KeyCapture[],
    /** The mount point: the size for the geometry, and "focus nowhere" for the stack. */
    mount: Pick<Mount, 'size' | 'idle'>,
  ) {
    this.popups = new Popups((el) => mount.idle(el));
    this.geometry = new Geometry(remember, mount.size);
  }

  /** Whether a surface catches keys whole — then `Esc` may not be promised. */
  catchesKeys(context: KeyContext): boolean {
    return this.captures().some((one) => one.catches(context));
  }
}
