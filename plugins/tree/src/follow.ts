import { TREE_DEFAULTS } from './settings.js';
import type { Ide } from '@mosetta/ide-api/client';
import { computed } from '@preact/signals';
import type { TreeSelection } from './state.js';
import DocPlugin from '@mosetta/ide-plugin-doc';

/**
 * The tree follows the caret.
 *
 * The open file is expanded in the tree along its whole path and highlighted — a habit
 * from IDEA, where it is called "Always Select Opened File". The rule for the switch
 * comes from there too: this is a SETTING rather than state, so it lives in the
 * settings file and outlives not only the tab but the machine. It is written by the
 * core — a plugin has no path of its own to the settings file and should not have one.
 */
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

  /** Reveal the open file, if the tree is following the caret. */
  async now(): Promise<void> {
    if (!this.on.peek()) return;
    const path = this.ide.getPlugin(DocPlugin).openDoc.value?.path;
    if (path) await this.selection.reveal(path);
  }
}
