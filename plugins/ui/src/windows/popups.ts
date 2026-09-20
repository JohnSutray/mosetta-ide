import { signal } from '@preact/signals';

/**
 * The stack of open popups.
 *
 * Escape has to close a popup — any of them, including the ones not yet written. Every
 * popup used to declare a key of its own in the keymap, and a new popup was born
 * without one: the rule lived in an understanding rather than in code.
 *
 * Now the frame puts itself into the stack, and `popup.close` closes the top one. The
 * stack is needed because popups come one above another: the push window opens from the
 * branches popup, and Escape has to peel off one layer at a time.
 */

export interface OpenPopup {
  id: string;
  close: () => void;
  /**
   * The popup's frame itself. Needed for exactly one thing: working out whether it
   * holds the focus when it closes.
   */
  el?: HTMLElement | null;
  /**
   * A layer OVER a window — a menu, a tooltip, a plate next to a row. Those live inside
   * somebody else's window and put nobody else's out.
   */
  layer?: boolean;
  /**
   * The window this popup is DELIBERATELY opened over: push is called from branches,
   * and the branches beneath it have to stay. Everything else is an accident, and that
   * we close.
   */
  over?: string;
}

export class Popups {
  readonly stack = signal<OpenPopup[]>([]);

  /**
   * Where we came into the popup from.
   *
   * An end-to-end rule: a popup closed means the human returned TO where they opened it
   * from, with the same caret. Otherwise after Escape the focus ends up on `body`: the
   * caret in the editor is in place and visible, but the arrows do not move it and the
   * letters do not type — the panel looks like it works and does not.
   *
   * Remembering that is the frame's job rather than every popup's: a new surface has to
   * get the behaviour by the fact of being born. It works for a stack too — a popup
   * above a popup gives the focus back to the lower one, because that is what its
   * memory holds.
   */
  private readonly cameFrom = new Map<string, HTMLElement>();

  /**
   * Focus is "nowhere": the page body, or the IDE's root itself. There is nobody to
   * return it to there — so we return it to where we came from.
   */
  constructor(private readonly idle: (el: Element | null) => boolean = (el) => el === null || el === document.body) {}

  get anyOpen(): boolean {
    return this.stack.value.length > 0;
  }

  enter(popup: OpenPopup): void {
    const top = this.stack.value[this.stack.value.length - 1];
    if (top && top.id === popup.id && top.close === popup.close) return;

    if (!popup.layer) {
      for (const item of this.stack.value) {
        if (item.layer || item.id === popup.id || item.id === popup.over) continue;
        item.close();
      }
    }
    const from = this.active();
    if (from && !this.cameFrom.has(popup.id)) this.cameFrom.set(popup.id, from);

    this.stack.value = [...this.stack.value.filter((item) => item.id !== popup.id), popup];
  }

  leave(id: string): void {
    const closing = this.stack.value.find((item) => item.id === id);
    this.stack.value = this.stack.value.filter((item) => item.id !== id);
    const from = this.cameFrom.get(id);
    this.cameFrom.delete(id);
    if (from) this.restore(from, closing?.el ?? null);
  }

  /** Close the top one. Returns false if there is nothing to close. */
  closeTop(): boolean {
    const top = this.stack.value[this.stack.value.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }

  /**
   * Give the focus back, if it is still "nobody's".
   *
   * The condition matters: a human may have closed the popup by CLICKING on the tree —
   * and then the focus already belongs to the tree, and taking it away means arguing
   * with the mouse.
   *
   * We look NOT AT ONCE but on the next microtask. `leave` is called from an effect's
   * cleanup, i.e. in the middle of unmounting: the popup is still in the document, the
   * focus is still on it, and "is the focus nobody's" cannot be asked at that moment.
   */
  private restore(from: HTMLElement, popup: HTMLElement | null): void {
    const decide = () => {
      if (!from.isConnected) return;
      const now = this.active();
      const nobody =
        !now || this.idle(now) || !now.isConnected || (popup ? popup.contains(now) : false);
      if (!nobody) return;
      from.focus({ preventScroll: true });
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(decide);
    else decide();
  }

  private active(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    const el = document.activeElement as HTMLElement | null;
    return el && typeof el.focus === 'function' ? el : null;
  }
}
