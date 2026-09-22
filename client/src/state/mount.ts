import { signal } from '@preact/signals';
import type { Bounds, Mount } from '@mosetta/ide-api/client';
import type { Dial } from '../rpc/client.js';

export interface MountOptions {
  /**
   * The IDE takes up the whole page: it listens to the browser window and writes the
   * tab's title. An embedded one listens to its own root and leaves the title alone.
   */
  page: boolean;
}

/** The class on the IDE's root; every rule of the IDE's styles hangs from it. */
export const ROOT_CLASS = 'mosetta-ide';

/** How the IDE is brought up: where it lives, and optionally what it talks to. */
export interface CoreOptions extends MountOptions {
  /**
   * Opens the connection to the daemon instead of the default socket. Anything shaped
   * like a `WebSocket` will do, which is how the website runs the IDE with no daemon at
   * all.
   */
  dial?: Dial;
}

/**
 * Where the IDE is mounted.
 *
 * The root gets the `mosetta-ide` class, which every rule of the core's own stylesheet
 * hangs from, so none of them reaches the rest of a page the IDE is embedded in. It gets
 * `contain: layout`, so an overlay's `position: fixed` is measured from
 * it rather than from the window. It is also focusable (`tabIndex=-1`): a click on
 * empty space leaves focus inside the IDE rather than on the page body. Its size
 * arrives as a signal (`ResizeObserver`) and as the CSS variables `--mount-w` and
 * `--mount-h`, so that plugin styles measure from the root rather than from `vw`/`vh`.
 */
export class RootMount implements Mount {
  readonly size = signal({ w: 0, h: 0 });

  constructor(
    private readonly root: HTMLElement,
    private readonly options: MountOptions,
  ) {
    root.classList.add(ROOT_CLASS);
    root.style.contain = 'layout';
    root.style.outline = 'none';
    root.tabIndex = -1;
    this.measure();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.measure()).observe(root);
  }

  bounds(): Bounds {
    const box = this.root.getBoundingClientRect();
    return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
  }

  local(x: number, y: number): { x: number; y: number } {
    const box = this.root.getBoundingClientRect();
    return { x: x - box.left, y: y - box.top };
  }

  idle(el: Element | null): boolean {
    return el === null || el === document.body || el === this.root;
  }

  listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
    options?: { capture?: boolean },
  ): () => void {
    const target: EventTarget = this.options.page ? window : this.root;
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    return () => target.removeEventListener(type, listener, options);
  }

  title(text: string): void {
    if (this.options.page) document.title = text;
  }

  reveal(el: Element | null | undefined, block: 'nearest' | 'center' = 'nearest'): void {
    if (!el) return;
    let box = el.parentElement;
    while (box && !scrollsItself(box)) box = box.parentElement;
    if (!box) return;
    const inner = el.getBoundingClientRect();
    const outer = box.getBoundingClientRect();
    const top = inner.top - outer.top - box.clientTop;
    const left = inner.left - outer.left - box.clientLeft;
    if (block === 'center') box.scrollTop += top - (box.clientHeight - inner.height) / 2;
    else if (top < 0 || inner.height > box.clientHeight) box.scrollTop += top;
    else if (top + inner.height > box.clientHeight) box.scrollTop += top + inner.height - box.clientHeight;
    if (left < 0 || inner.width > box.clientWidth) box.scrollLeft += left;
    else if (left + inner.width > box.clientWidth) box.scrollLeft += left + inner.width - box.clientWidth;
  }

  private measure(): void {
    const box = this.root.getBoundingClientRect();
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    const was = this.size.peek();
    if (w === was.w && h === was.h) return;
    this.size.value = { w, h };
    this.root.style.setProperty('--mount-w', `${w}px`);
    this.root.style.setProperty('--mount-h', `${h}px`);
  }
}

function scrollsItself(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  const scrollable = (value: string) => value === 'auto' || value === 'scroll' || value === 'overlay';
  return (
    (scrollable(style.overflowY) && el.scrollHeight > el.clientHeight) ||
    (scrollable(style.overflowX) && el.scrollWidth > el.clientWidth)
  );
}
