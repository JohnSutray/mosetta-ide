import { signal } from '@preact/signals';
import type { PackageManagerInfo, ShellInfo } from '@ide/protocol';
import { complain, current, rpc, say } from './session.js';

export type ToolKind = 'shell' | 'manager';

const KEYS: Record<ToolKind, { section: string; key: string }> = {
  shell: { section: 'terminal', key: 'shell' },
  manager: { section: 'tools', key: 'packageManager' },
};

export class Tools {
  readonly picker = signal<ToolKind | null>(null);
  readonly shells = signal<ShellInfo[]>([]);
  readonly managers = signal<PackageManagerInfo[]>([]);
  readonly draft = signal('');

  currentShell(): string {
    return this.shells.value.find((item) => item.current)?.name ?? '';
  }

  currentManager(): string {
    return this.managers.value.find((item) => item.current)?.name ?? '';
  }

  open(kind: ToolKind): void {
    this.picker.value = kind;
    this.draft.value = '';
    void this.refresh();
  }

  close(): void {
    this.picker.value = null;
  }

  async refresh(): Promise<void> {
    try {
      this.shells.value = await rpc.call('env.shells', null);
    } catch (err) {
      this.shells.value = [];
      complain(`shells: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!current.peek()) {
      this.managers.value = [];
      return;
    }
    try {
      this.managers.value = await rpc.call('env.packageManagers', null);
    } catch (err) {
      this.managers.value = [];
      complain(`package managers: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async choose(kind: ToolKind, value: string): Promise<void> {
    const where = KEYS[kind];
    try {
      await rpc.call('config.set', { ...where, value });
      this.close();
      await this.refresh();
      say(value === '' ? `${where.key}: default` : `${where.key}: ${value}`);
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
    }
  }
}

export const tools = new Tools();
