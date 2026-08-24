import { computed } from '@preact/signals';
import { followEditor, settings } from './config.js';
import { complain, openFile, rpc } from './session.js';
import { revealInTree } from './tree-ops.js';

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
  const path = openFile.peek()?.path;
  if (path) await revealInTree(path);
}
