import { USER_LAYER, activate, command, configSection, inLayerOrder, plugin, registry, settingsKey } from '@mosetta/ide-api/client';
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

/**
 * An instance for our OWN section editor.
 *
 * The `@configSection` decorator runs when the module is imported, while the plugin is
 * born later: `editor` is a function, and by the time it is called the instance already
 * exists. The module-level variable here is a deliberate exception: it is not state but
 * a reference to the owner, and it lives exactly as long as the owner does.
 */
let keymapPlugin: KeymapPlugin | null = null;

/**
 * A contribution to the `keys.mechanics` key: somebody's input mechanics — the keys the
 * widget handles itself, past the layout. The editor puts them there; we neither
 * swallow such keys nor complain about them.
 */
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

  /**
   * The whole layout: the factory one plus my own rows, merged BY PLACE — key, context,
   * environment.
   *
   * The layers lie as entries in their section's key, and the plugin merges them
   * itself: the general rule for settings is "an array is replaced whole", while a
   * layout needs it row by row, or the first personal edit of a key would carry off a
   * copy of the entire shipment.
   */
  readonly layout: ReadonlySignal<Keymap>;
  /** Only MY rows — what lies in my own `settings.json`. */
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

  /**
   * The keys as the dispatcher sees them: the environment, the whole layout, what has
   * been taken away, and the echo of the last press. The "Keys" window reads this from
   * here — through the instance rather than through a module name.
   */
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

  /**
   * Our own tips for the section editor: the widgets plugin shows them, and they reach
   * us as an entry in the `ui.tips` key. They cannot be taken by import — the widgets
   * depend on us, and an arrow back would close the circle. Turn the widgets off and
   * the icons stay without captions; that is all that happens.
   */
  get tips(): TipsLike | null {
    return this.ide.registry<TipsLike>('ui.tips').all.value[0] ?? null;
  }

  /** What keys a command is called by — the captions of buttons and tips. */
  keysFor(command: string): string[] {
    return keysFor(this.layout.value.bindings, command);
  }

  /** Whether this command's chord is held at the moment of the click. */
  chordHeld(command: string, event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): boolean {
    return chordHeld(this.layout.value.bindings, command, event);
  }

  /** Whether the MAIN modifier of this environment is held: Cmd on a Mac. */
  primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    return keyHost.primaryHeld(event);
  }

  @command('key.reserved') protected reserved(): void {}
  @command('field.native') protected fieldNative(): void {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
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
