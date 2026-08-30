import { doc, rpc } from './session.js';
import { complain } from './notifications.js';
import { tree } from './tree-ops.js';
import { computed } from '@preact/signals';
import { followEditor, settings } from './config.js';

export const following = computed(() => settings.value !== null && followEditor());

export async function toggleFollow(): Promise<void> {
  const next = !following.peek();
  try {
    await rpc.call('config.set', { section: 'tree', key: 'followEditor', value: next });
    if (next) await follow();
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}

export async function follow(): Promise<void> {
  if (!following.peek()) return;
  const path = doc.open.peek()?.path;
  if (path) await tree.reveal(path);
}
