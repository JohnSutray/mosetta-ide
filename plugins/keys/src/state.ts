import { signal } from '@preact/signals';
import type { KeyHost } from '@mosetta/ide-plugin-keymap';

/**
 * The keys window: whether it is open, and which layout we are looking at. The
 * keystroke echo and the complaint about a miss stayed with the core — that is the
 * dispatcher's knowledge rather than the window's, and it arrives here through the
 * contract.
 */
export class KeysWindow {
  readonly open = signal(false);

  /**
   * Which layout we are looking at. `null` means our own. The switch in the window
   * writes here: the layouts live in one file, and they should be configured from one
   * place rather than by reopening the IDE another way: two layouts are held and
   * configured at once, and the IDE can be entered either way.
   */
  readonly viewHost = signal<KeyHost | null>(null);

  toggle(): void {
    this.open.value = !this.open.value;
  }

  close(): void {
    this.open.value = false;
  }
}
