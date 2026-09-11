import { signal } from '@preact/signals';
import type { Bounds, Mount } from '@ide/api/client';

export interface MountOptions {
  page: boolean;
}

export class RootMount implements Mount {
  readonly size = signal({ w: 0, h: 0 });

  constructor(
    private readonly root: HTMLElement,
    private readonly options: MountOptions,
  ) {
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
