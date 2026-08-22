import { signal } from '@preact/signals';
import type { ShellInfo } from '@ide/protocol';
import { rpc, say } from './session.js';

export const shellPickerOpen = signal(false);
export const shells = signal<ShellInfo[]>([]);
export const shellDraft = signal('');

export function openShellPicker(): void {
  shellPickerOpen.value = true;
  void refreshShells();
}

export function closeShellPicker(): void {
  shellPickerOpen.value = false;
}

export async function refreshShells(): Promise<void> {
  try {
    const list = await rpc.call('env.shells', null);
    shells.value = list;
    shellDraft.value = list.find((item) => item.current)?.path ?? '';
  } catch {
    shells.value = [];
  }
}

export async function chooseShell(file: string): Promise<void> {
  try {
    const { path } = await rpc.call('config.setShell', { path: file });
    closeShellPicker();
    say(path === '' ? 'shell: system default' : `shell: ${path}`);
  } catch (err) {
    say(err instanceof Error ? err.message : String(err));
  }
}
