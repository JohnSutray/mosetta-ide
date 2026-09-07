import { setSetting, settingsOf } from '@ide/api/client';
import { TREE_DEFAULTS } from './settings.js';
import { openDoc } from '@ide/plugin-doc';
import type { Ide } from '@ide/api/client';
import { computed } from '@preact/signals';
import type { TreeSelection } from './state.js';

export class TreeFollow {
  readonly on = computed(() => settingsOf('tree', TREE_DEFAULTS).value.followEditor);

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
