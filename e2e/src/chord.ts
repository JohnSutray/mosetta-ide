import type { KeyBinding, KeyScope } from '../../plugins/keymap/src/types.js';

export class Chord {
  private readonly named: Record<string, string> = {
    meta: 'Meta',
    control: 'Control',
    alt: 'Alt',
    shift: 'Shift',
    enter: 'Enter',
    escape: 'Escape',
    tab: 'Tab',
    space: 'Space',
    backspace: 'Backspace',
    delete: 'Delete',
    backquote: 'Backquote',
    slash: 'Slash',
    backslash: 'Backslash',
    comma: 'Comma',
    period: 'Period',
    minus: 'Minus',
    equal: 'Equal',
    semicolon: 'Semicolon',
    quote: 'Quote',
    bracketleft: 'BracketLeft',
    bracketright: 'BracketRight',
    arrowleft: 'ArrowLeft',
    arrowright: 'ArrowRight',
    arrowup: 'ArrowUp',
    arrowdown: 'ArrowDown',
    pageup: 'PageUp',
    pagedown: 'PageDown',
    home: 'Home',
    end: 'End',
  };

  presses(key: string): { key: string; times: number } {
    const double = /^double:(.+)$/.exec(key);
    if (double) return { key: this.one(double[1]!), times: 2 };
    return { key: key.split('+').map((part) => this.one(part)).join('+'), times: 1 };
  }

  private one(part: string): string {
    if (this.named[part]) return this.named[part]!;
    if (/^[a-z]$/.test(part)) return `Key${part.toUpperCase()}`;
    if (/^[0-9]$/.test(part)) return `Digit${part}`;
    if (/^f([1-9]|1[0-2])$/.test(part)) return part.toUpperCase();
    throw new Error(`не знаю, как нажать «${part}» — допиши таблицу в chord.ts`);
  }
}

export class Rows {
  constructor(private readonly scopes: KeyScope[]) {}

  global(bindings: KeyBinding[]): KeyBinding[] {
    return bindings.filter(
      (binding) =>
        !binding.when &&
        (!binding.where || binding.where.length === 0 || binding.where.some((scope) => this.scopes.includes(scope))),
    );
  }

  contextual(bindings: KeyBinding[]): number {
    return bindings.filter((binding) => Boolean(binding.when)).length;
  }
}
