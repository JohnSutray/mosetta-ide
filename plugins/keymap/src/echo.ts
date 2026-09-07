import { signal } from '@preact/signals';
import type { KeyContext, Keymap } from '@ide/protocol';
import { keyHost } from './host.js';
import { keyRules } from './dispatcher.js';

export interface KeyEcho {
  key: string;
  context: KeyContext;
  command: string | null;
  seq: number;
}

export interface EchoServices {
  sayOnce(slot: string, message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
  keymap(): Keymap;
}

export class KeysEcho {
  readonly lastKey = signal<KeyEcho | null>(null);

  constructor(private readonly services: EchoServices) {}

  private seq = 0;

  echo(key: string, context: KeyContext, command: string | null): void {
    this.seq += 1;
    this.lastKey.value = { key, context, command, seq: this.seq };
  }

  noteUnbound(key: string): void {
    this.services.sayOnce(
      'keys.unbound',
      this.services.t('keys.unbound', { key: keyHost.humanize(key), help: this.helpKey() }),
    );
  }

  private helpKey(): string {
    const bound = this.services
      .keymap()
      .bindings.find((binding) => binding.command === 'keys.show' && keyRules.appliesHere(binding));
    return bound ? keyHost.humanize(bound.key) : 'keys.show';
  }
}
