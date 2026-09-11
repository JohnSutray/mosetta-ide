import { TREE_DEFAULTS } from './settings.js';
import type { Ide } from '@ide/api/client';
import { computed } from '@preact/signals';
import type { TreeSelection } from './state.js';
import DocPlugin from '@ide/plugin-doc';

export class TreeFollow {
  readonly on = computed(() => this.ide.settingsOf('tree', TREE_DEFAULTS).value.followEditor);

  constructor(
    private readonly selection: TreeSelection,
    private readonly ide: Ide,
  ) {}

  async toggle(): Promise<void> {
    const next = !this.on.peek();
    try {
      await this.ide.setSetting('tree', 'followEditor', next);
      if (next) await this.now();
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  async now(): Promise<void> {
    if (!this.on.peek()) return;
    const path = this.ide.getPlugin(DocPlugin).openDoc.value?.path;
    if (path) await this.selection.reveal(path);
  }
}
