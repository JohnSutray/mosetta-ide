import { signal } from '@preact/signals';
import type { KeyContext, KeyHost } from '@ide/protocol';
import { settle } from './notifications.js';
import { config } from './config.js';
import { keyHost } from '../keys/host.js';
import { appliesHere } from '../keys/dispatcher.js';
import { i18n } from '../i18n/index.js';

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: string | null;
  seq: number;
}

export class KeysHelp {
  readonly open = signal(false);

  readonly viewHost = signal<KeyHost | null>(null);

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

  toggle(): void {
    this.open.value = !this.open.value;
  }

  close(): void {
    this.open.value = false;
  }

  private helpKey(): string {
    const bound = config.keymap
      .peek()
      .bindings.find((binding) => binding.command === 'keys.show' && appliesHere(binding));
    return bound ? keyHost.humanize(bound.key) : i18n.t('keys.title');
  }
}

export const keysHelp = new KeysHelp();
