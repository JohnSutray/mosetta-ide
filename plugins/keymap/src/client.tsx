import {
  activate,
  configSection,
  inLayerOrder,
  plugin,
  registry,
  settingsKey,
  USER_LAYER,
} from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { computed, effect, type ReadonlySignal } from '@preact/signals';
import { FACTORY_KEYMAP, KEYMAP_SCHEMA } from './keymap.js';
import { keymapRules } from './rules.js';
import { KeymapEditor } from './editor.jsx';
import { STYLE } from './style.js';
import type { KeyBinding, KeyContext, KeyHost, KeyOs, KeyScope, Keymap, TipsLike } from './types.js';
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
export type { KeyBinding, KeyContext, KeyHost, KeyOs, KeyScope, Keymap, TipsLike } from './types.js';
export { keymapRules } from './rules.js';
export { FACTORY_KEYMAP, KEYMAP_SCHEMA } from './keymap.js';

let keymapPlugin: KeymapPlugin | null = null;

export interface InputMechanicsEntry {
  id: string;
  keys(isMac: boolean): ReadonlySet<string>;
}

const MECHANICS_SCHEMA = {
  type: 'object',
  required: ['id', 'keys'],
  properties: { id: { type: 'string' }, keys: {} },
} as const;

@configSection({
  section: 'keymap',
  defaults: FACTORY_KEYMAP,
  schema: KEYMAP_SCHEMA,
  editor: () => <KeymapEditor plugin={keymapPlugin!} />,
})
@registry({ key: 'keys.mechanics', schema: MECHANICS_SCHEMA })
@plugin({ title: 'plugin.keymap' })
export default class KeymapPlugin {
  readonly echo: KeysEcho;
  private dispatcher: Dispatcher | null = null;

  readonly layout: ReadonlySignal<Keymap>;
  readonly personal: ReadonlySignal<Keymap>;

  constructor(private readonly ide: Ide) {
    keymapRules.speakThrough((message) => ide.notes.notify(message, 'error'));
    const layers = ide.registry<Keymap>(settingsKey('keymap')).entries;
    this.layout = computed(() =>
      inLayerOrder(layers.value).reduce<Keymap>(
        (all, one) => keymapRules.layer(all, keymapRules.validate(one.value)),
        { version: 1, bindings: [] },
      ),
    );
    this.personal = computed(() => {
      const own = layers.value.find((one) => one.by === USER_LAYER)?.value;
      return keymapRules.validate((own ?? null) as Keymap | null);
    });
    keymapPlugin = this;
    this.echo = new KeysEcho({
      sayOnce: (slot, message) => ide.sayOnce(slot, message),
      t: ide.t,
      keymap: () => this.layout.value,
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
        return plugin.layout.value.bindings;
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

  get tips(): TipsLike | null {
    return this.ide.registry<TipsLike>('ui.tips').all.value[0] ?? null;
  }

  keysFor(command: string): string[] {
    return keysFor(this.layout.value.bindings, command);
  }

  chordHeld(command: string, event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
    return chordHeld(this.layout.value.bindings, command, event);
  }

  primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    return keyHost.primaryHeld(event);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
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
        (id) => this.ide.runCommand(id),
        this.ide.mount,
      );
      const dispatcher = this.dispatcher;
      effect(() => dispatcher.setKeymap(this.layout.value));
    }

    this.ide
      .registry<{ id: string; catches(context: KeyContext): boolean }>('ui.captures')
      .add({ id: 'keymap', catches: (context) => keyRules.catchesKeys(context) });
  }
}
