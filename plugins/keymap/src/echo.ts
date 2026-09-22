import { signal } from '@preact/signals';
import type { KeyContext, Keymap } from './types.js';
import { keyHost } from './host.js';
import { keyRules } from './dispatcher.js';

/**
 * The echo of the last press, and the complaint about a miss.
 *
 * The dispatcher alone listens to the keyboard, and alone knows what a press turned
 * into and whether a command was found. The window that shows this is a neighbour
 * (`@mosetta/ide-plugin-keys`); the echo is handed to it from the table (`keys.echo`).
 *
 * The echo turns silence into an answer: you see the STRING the press turned into, the
 * context it happened in, and the command that was found (or was not). If the user
 * presses Control and Option arrives, that will be written down.
 */

export interface KeyEcho {
  /** What the press turned into: `mod+1`, `alt+1`, `cmd+shift+c`. */
  key: string;
  context: KeyContext;
  /** What was found in the layout. Empty means the key calls nothing. */
  command: string | null;
  /** A serial number: an identical press twice in a row has to be noticeable. */
  seq: number;
}

/** What the echo speaks with and what it reads: it arrives through the constructor. */
export interface EchoServices {
  /** One line for misses: the next one overwrites the previous. */
  sayOnce(slot: string, message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
  keymap(): Keymap;
}

export class KeysEcho {
  /** What the last press turned into, and whether a command was found. */
  readonly lastKey = signal<KeyEcho | null>(null);

  constructor(private readonly services: EchoServices) {}

  private seq = 0;

  echo(key: string, context: KeyContext, command: string | null): void {
    this.seq += 1;
    this.lastKey.value = { key, context, command, seq: this.seq };
  }

  /** Say out loud that the key calls nothing. */
  noteUnbound(key: string): void {
    this.services.sayOnce(
      'keys.unbound',
      this.services.t('keys.unbound', { key: keyHost.humanize(key), help: this.helpKey() }),
    );
  }

  /**
   * What the window with all the keys is called by — we ask the layout itself, and
   * necessarily the row for THIS environment: there are several layouts in the file,
   * and the first one to hand turned out to be somebody else's. The command belongs to
   * a plugin, but that does not stop a row in the layout being a row.
   */
  private helpKey(): string {
    const bound = this.services
      .keymap()
      .bindings.find((binding) => binding.command === 'keys.show' && keyRules.appliesHere(binding));
    return bound ? keyHost.humanize(bound.key) : 'keys.show';
  }
}
