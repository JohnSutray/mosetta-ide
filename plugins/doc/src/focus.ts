import { signal } from '@preact/signals';

/**
 * The handshake about focus.
 *
 * There is no live editor here. What there is is an AGREEMENT about the keyboard, and
 * it is not about CodeMirror: anyone who draws text would keep it.
 */
export class EditorFocus {
  /**
   * A request to move the keyboard into the text — as a COUNTER rather than a call.
   *
   * Needed where the file is ALREADY open: the editor is then not born again, and the
   * mark below has nothing to fire on. A rising number is needed so that a second
   * request in a row works too.
   */
  readonly wanted = signal(0);

  /**
   * Whether to take the keyboard when the editor is born.
   *
   * Yes by default: arriving from search or opening a file by hand means the typing
   * will be in it. But a single click in the tree leaves focus with THE TREE, otherwise
   * not one of the tree's keys works after it. The mark is one-shot: it is set right
   * before the open and cleared the moment it is read.
   */
  private onMount = true;

  openWithoutFocus(): void {
    this.onMount = false;
  }

  takeOnMount(): boolean {
    const wanted = this.onMount;
    this.onMount = true;
    return wanted;
  }

  focus(): void {
    this.wanted.value += 1;
  }
}
