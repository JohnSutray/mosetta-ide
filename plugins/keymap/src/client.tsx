import { activate, registry } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import type { KeyBinding, KeyHost, KeyOs, KeyScope } from '@ide/protocol';
import { effect } from '@preact/signals';
import { keyContexts } from './context.js';
import { Dispatcher, keyRules } from './dispatcher.js';
import { KeysEcho, type KeyEcho } from './echo.js';
import { keyHost } from './host.js';
import { reserved, type ReservedKey } from './reserved.js';
import { chordHeld } from './chords.js';
import { keysFor } from './keys-for.js';

export { keyContexts } from './context.js';
export { keyRules } from './dispatcher.js';
export { keyHost, KeyHostInfo } from './host.js';
export { reserved } from './reserved.js';
export type { KeyEcho } from './echo.js';
export type { ReservedKey as TakenKey } from './reserved.js';

export interface InputMechanicsEntry {
  id: string;
  keys(isMac: boolean): ReadonlySet<string>;
}

const MECHANICS_SCHEMA = {
  type: 'object',
  required: ['id', 'keys'],
  properties: { id: { type: 'string' }, keys: {} },
} as const;

@registry({ key: 'keys.mechanics', schema: MECHANICS_SCHEMA })
export default class KeymapPlugin {
  readonly echo: KeysEcho;
  private dispatcher: Dispatcher | null = null;

  constructor(private readonly ide: Ide) {
    this.echo = new KeysEcho({
      sayOnce: (slot, message) => ide.sayOnce(slot, message),
      t: ide.t,
      keymap: () => this.ide.keymap.value,
    });
  }

  readonly keys: {
    readonly host: KeyHost;
    readonly os: KeyOs;
    readonly bindings: { readonly value: KeyBinding[] };
    humanize(key: string): string;
    taken(scopes: KeyScope[]): ReservedKey[];
    readonly echo: { readonly value: KeyEcho | null };
  } = ((plugin: KeymapPlugin) => ({
    get host() {
      return keyHost.host;
    },
    get os() {
      return keyHost.os;
    },
    bindings: {
      get value() {
        return plugin.ide.keymap.value.bindings;
      },
    },
    humanize: (key: string) => keyHost.humanize(key),
    taken: (scopes: KeyScope[]) => reserved.in(scopes),
    echo: {
      get value(): KeyEcho | null {
        return plugin.echo.lastKey.value;
      },
    },
  }))(this);

  keysFor(command: string): string[] {
    return keysFor(this.ide.keymap.value.bindings, command);
  }

  chordHeld(command: string, event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
    return chordHeld(this.ide.keymap.value.bindings, command, event);
  }

  primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    return keyHost.primaryHeld(event);
  }

  @activate() protected start(): void {
    this.ide.command('key.reserved', () => {});
    this.ide.command('field.native', () => {});

    const mechanics = this.ide.registry<InputMechanicsEntry>('keys.mechanics').all;
    effect(() => {
      const keys = new Set<string>();
      for (const one of mechanics.value) for (const key of one.keys(keyHost.isMac)) keys.add(key);
      keyRules.useMechanics(keys);
    });

    if (typeof window !== 'undefined') {
      this.dispatcher = new Dispatcher(
        () => keyContexts.hereChain(),
        (key) => this.echo.noteUnbound(key),
        this.echo,
        this.ide.windows,
        (id) => this.ide.runCommand(id),
      );
      const dispatcher = this.dispatcher;
      effect(() => dispatcher.setKeymap(this.ide.keymap.value));
    }

    this.ide.windows.updateHost({ catchesKeys: (context) => context !== undefined && keyRules.catchesKeys(context) });
  }
}
