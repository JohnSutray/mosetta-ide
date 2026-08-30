import { doc, rpc } from './session.js';
import { complain } from './notifications.js';
import { tree } from './tree-ops.js';
import { computed } from '@preact/signals';
import { config } from './config.js';

export class TreeFollow {
  readonly on = computed(() => config.settings.value !== null && config.followEditor());

  async toggle(): Promise<void> {
    const next = !this.on.peek();
    try {
      await rpc.call('config.set', { section: 'tree', key: 'followEditor', value: next });
      if (next) await this.now();
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
    }
  }

  async now(): Promise<void> {
    if (!this.on.peek()) return;
    const path = doc.open.peek()?.path;
    if (path) await tree.reveal(path);
  }
}

export const treeFollow = new TreeFollow();
