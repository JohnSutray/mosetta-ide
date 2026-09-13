import type { KeyBinding, Keymap } from './types.js';

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

export class KeymapRules {
  private complain: (message: string) => void = () => undefined;

  speakThrough(say: (message: string) => void): void {
    this.complain = say;
  }

  validate(raw: Keymap | null): Keymap {
    if (!raw || !Array.isArray(raw.bindings)) return { version: 1, bindings: [] };
    const seen = new Map<string, KeyBinding>();
    const bindings: KeyBinding[] = [];

    for (const binding of raw.bindings) {
      const removal = binding?.remove === true;
      if (!binding || typeof binding.key !== 'string' || (!removal && typeof binding.command !== 'string')) {
        this.complain(`битая строка раскладки: ${JSON.stringify(binding)}`);
        continue;
      }
      const slot = this.slotOf(binding);
      const previous = seen.get(slot);
      if (previous) {
        this.complain(
          `раскладка: ${binding.key} (${binding.when ?? 'global'}) занята ` +
            `командой ${previous.command}, ${binding.command} проигнорирована`,
        );
        continue;
      }
      seen.set(slot, binding);
      bindings.push({ ...binding, command: binding.command ?? '', key: this.normalizeKey(binding.key) });
    }

    return { version: raw.version ?? 1, bindings };
  }

  slotOf(binding: KeyBinding): string {
    const where = [...(binding.where ?? [])].sort().join(',');
    return `${where}|${binding.when ?? 'global'}:${this.normalizeKey(binding.key)}`;
  }

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

export const keymapRules = new KeymapRules();
