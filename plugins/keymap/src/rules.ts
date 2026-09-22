import type { KeyBinding, Keymap } from './types.js';

/**
 * What THIS KEY is called on your keyboard.
 *
 * One physical key has two vendor names: ⌘ on a Mac, the flag on Windows. The canonical
 * name is one — `meta`, because that is what the browser itself calls it
 * (`event.metaKey`), and no translation is left between the layout and the event. But
 * by hand a human will write what they see on the key, so the synonyms are accepted and
 * brought to the canon on reading.
 */
const ALIASES: Record<string, string> = {
  cmd: 'meta',
  command: 'meta',
  win: 'meta',
  windows: 'meta',
  super: 'meta',
  ctrl: 'control',
  option: 'alt',
  opt: 'alt',
  esc: 'escape',
  return: 'enter',
};

/** Checking the layout: a broken config does not bring the editor down. */
export class KeymapRules {
  /**
   * Where to complain about a broken row. Set by the plugin on start-up (`ide.log`):
   * this used to be the SERVER's journal, and then the layout moved into a home of its
   * own.
   */
  private complain: (message: string) => void = () => undefined;

  speakThrough(say: (message: string) => void): void {
    this.complain = say;
  }

  /**
   * A key assigned to a command that does not exist is a dead feature nobody would
   * otherwise notice. So such bindings are thrown out with a curse rather than silently
   * not working.
   */
  validate(raw: Keymap | null): Keymap {
    if (!raw || !Array.isArray(raw.bindings)) return { version: 1, bindings: [] };
    const seen = new Map<string, KeyBinding>();
    const bindings: KeyBinding[] = [];

    for (const binding of raw.bindings) {
      const removal = binding?.remove === true;
      if (!binding || typeof binding.key !== 'string' || (!removal && typeof binding.command !== 'string')) {
        this.complain(`broken layout row: ${JSON.stringify(binding)}`);
        continue;
      }
      const slot = this.slotOf(binding);
      const previous = seen.get(slot);
      if (previous) {
        this.complain(
          `layout: ${binding.key} (${binding.when ?? 'global'}) is taken by ` +
            `the command ${previous.command}, ${binding.command}, and so ignored`,
        );
        continue;
      }
      seen.set(slot, binding);
      bindings.push({ ...binding, command: binding.command ?? '', key: this.normalizeKey(binding.key) });
    }

    return { version: raw.version ?? 1, bindings };
  }

  /**
   * A row's place in the layout: one and the same key in DIFFERENT environments is not
   * a duplicate but a second layout, so the scope is part of the key. A personal row
   * finds the factory one by the same key.
   */
  slotOf(binding: KeyBinding): string {
    const where = [...(binding.where ?? [])].sort().join(',');
    return `${where}|${binding.when ?? 'global'}:${this.normalizeKey(binding.key)}`;
  }

  /**
   * Personal differences on top of the factory layout.
   *
   * The merge is ROW BY ROW rather than "the whole file": otherwise the first personal
   * edit of a key would carry off a copy of the entire shipment to the user, and the
   * new keys of later versions would never reach them again. A personal row with the
   * same place replaces the factory one, a row with `remove` takes it away, an
   * unfamiliar place is appended.
   */
  layer(factory: Keymap, personal: Keymap): Keymap {
    const order: string[] = [];
    const bySlot = new Map<string, KeyBinding>();
    const put = (binding: KeyBinding): void => {
      const slot = this.slotOf(binding);
      if (binding.remove) {
        bySlot.delete(slot);
        return;
      }
      if (!bySlot.has(slot)) order.push(slot);
      bySlot.set(slot, binding);
    };
    for (const binding of factory.bindings) put(binding);
    for (const binding of personal.bindings) put(binding);
    return {
      version: factory.version,
      bindings: order.flatMap((slot) => {
        const binding = bySlot.get(slot);
        return binding ? [binding] : [];
      }),
    };
  }

  /** `Meta+Shift+S`, `shift+cmd+s` and `Command+Shift+S` are one key. */
  normalizeKey(key: string): string {
    if (key.toLowerCase().startsWith('double:')) {
      const name = key.slice('double:'.length).trim().toLowerCase();
      return `double:${ALIASES[name] ?? name}`;
    }
    const parts = key
      .toLowerCase()
      .split('+')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => ALIASES[p] ?? p);
    const main = parts.pop() ?? '';
    const order = ['meta', 'control', 'alt', 'shift'];
    const mods = order.filter((m) => parts.includes(m));
    return [...mods, main].join('+');
  }
}

/** One per plugin: the parsing and the layers of the layout are shared by everyone. */
export const keymapRules = new KeymapRules();
