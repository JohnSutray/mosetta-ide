import { signal } from '@preact/signals';
import type { KeyHost } from '@ide/protocol';

export class KeysWindow {
  readonly open = signal(false);

  readonly viewHost = signal<KeyHost | null>(null);

  toggle(): void {
    this.open.value = !this.open.value;
  }

  close(): void {
    this.open.value = false;
  }
}
