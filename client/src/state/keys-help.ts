import { signal } from '@preact/signals';
import type { KeyContext, KeyHost } from '@ide/protocol';
import { settle } from './notifications.js';
import { keymap } from './config.js';
import { humanizeKey } from '../keys/host.js';
import { appliesHere } from '../keys/dispatcher.js';
import { t } from '../i18n/index.js';

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: string | null;
  seq: number;
}

export const keysHelpOpen = signal(false);

export const viewHost = signal<KeyHost | null>(null);
export const lastKey = signal<KeyEcho | null>(null);

let seq = 0;

export function echoKey(key: string, context: KeyContext, command: string | null): void {
  seq += 1;
  lastKey.value = { key, context, command, seq };
}

let missNote = 0;

export function noteUnbound(key: string): void {
  missNote = settle(missNote, t('keys.unbound', { key: humanizeKey(key), help: helpKey() }));
}

function helpKey(): string {
  const bound = keymap
    .peek()
    .bindings.find((binding) => binding.command === 'keys.show' && appliesHere(binding));
  return bound ? humanizeKey(bound.key) : t('keys.title');
}

export function toggleKeysHelp(): void {
  keysHelpOpen.value = !keysHelpOpen.value;
}

export function closeKeysHelp(): void {
  keysHelpOpen.value = false;
}
