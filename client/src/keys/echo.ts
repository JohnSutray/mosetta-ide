import { signal } from '@preact/signals';
import type { KeyContext } from '@ide/protocol';
import { settle } from '../state/notifications.js';
import { config } from '../state/config.js';
import { keyHost } from './host.js';
import { keyRules } from './dispatcher.js';
import { i18n } from '../i18n/index.js';

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: string | null;
  seq: number;
}

export class KeysEcho {
  readonly lastKey = signal<KeyEcho | null>(null);

  private seq = 0;
  private missNote = 0;

  echo(key: string, context: KeyContext, command: string | null): void {
    this.seq += 1;
    this.lastKey.value = { key, context, command, seq: this.seq };
  }

  noteUnbound(key: string): void {
    this.missNote = settle(
      this.missNote,
      i18n.t('keys.unbound', { key: keyHost.humanize(key), help: this.helpKey() }),
    );
  }

  private helpKey(): string {
    const bound = config.keymap
      .peek()
      .bindings.find((binding) => binding.command === 'keys.show' && keyRules.appliesHere(binding));
    return bound ? keyHost.humanize(bound.key) : 'keys.show';
  }
}

export const keysEcho = new KeysEcho();
