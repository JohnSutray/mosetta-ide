import { openDoc, setSetting, settings } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { computed } from '@preact/signals';
import type { TreeSelection } from './state.js';

export class TreeFollow {
  readonly on = computed(() => settings.value !== null && settings.value.tree.followEditor);

  constructor(
    private readonly selection: TreeSelection,
    private readonly ide: Ide,
  ) {}

  async toggle(): Promise<void> {
    const next = !this.on.peek();
    try {
      await setSetting('tree', 'followEditor', next);
      if (next) await this.now();
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  async now(): Promise<void> {
    if (!this.on.peek()) return;
    const path = openDoc.value?.path;
    if (path) await this.selection.reveal(path);
  }
}
