import { signal } from '@preact/signals';

export interface OpenPopup {
  id: string;
  close: () => void;
  el?: HTMLElement | null;
  layer?: boolean;
  over?: string;
}

export class Popups {
  readonly stack = signal<OpenPopup[]>([]);

  private readonly cameFrom = new Map<string, HTMLElement>();

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

  closeTop(): boolean {
    const top = this.stack.value[this.stack.value.length - 1];
    if (!top) return false;
    top.close();
    return true;
  }

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
