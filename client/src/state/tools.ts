import { signal } from '@preact/signals';
import type { PackageManagerInfo, ShellInfo } from '@ide/protocol';
import { complain, current, rpc, say } from './session.js';

export type ToolKind = 'shell' | 'manager';

export const toolPicker = signal<ToolKind | null>(null);
export const shells = signal<ShellInfo[]>([]);
export const managers = signal<PackageManagerInfo[]>([]);
export const toolDraft = signal('');

export function currentShell(): string {
  return shells.value.find((item) => item.current)?.name ?? '';
}

export function currentManager(): string {
  return managers.value.find((item) => item.current)?.name ?? '';
}

export function openToolPicker(kind: ToolKind): void {
  toolPicker.value = kind;
  toolDraft.value = '';
  void refreshTools();
}

export function closeToolPicker(): void {
  toolPicker.value = null;
}

export async function refreshTools(): Promise<void> {
  try {
    shells.value = await rpc.call('env.shells', null);
  } catch (err) {
    shells.value = [];
    complain(`shells: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!current.peek()) {
    managers.value = [];
    return;
  }
  try {
    managers.value = await rpc.call('env.packageManagers', null);
  } catch (err) {
    managers.value = [];
    complain(`package managers: ${err instanceof Error ? err.message : String(err)}`);
  }
}

const KEYS: Record<ToolKind, { section: string; key: string }> = {
  shell: { section: 'terminal', key: 'shell' },
  manager: { section: 'tools', key: 'packageManager' },
};

export async function chooseTool(kind: ToolKind, value: string): Promise<void> {
  const where = KEYS[kind];
  try {
    await rpc.call('config.set', { ...where, value });
    closeToolPicker();
    await refreshTools();
    say(value === '' ? `${where.key}: default` : `${where.key}: ${value}`);
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}
