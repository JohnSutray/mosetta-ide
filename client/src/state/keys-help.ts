import { signal } from '@preact/signals';
import type { CommandId, KeyContext } from '@ide/protocol';

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: CommandId | null;
  seq: number;
}

export const keysHelpOpen = signal(false);
export const lastKey = signal<KeyEcho | null>(null);

let seq = 0;

export function echoKey(key: string, context: KeyContext, command: CommandId | null): void {
  seq += 1;
  lastKey.value = { key, context, command, seq };
}

export function toggleKeysHelp(): void {
  keysHelpOpen.value = !keysHelpOpen.value;
}

export function closeKeysHelp(): void {
  keysHelpOpen.value = false;
}
