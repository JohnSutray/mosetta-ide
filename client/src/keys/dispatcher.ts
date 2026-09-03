import { inputMechanics } from '@ide/code';
import { commands } from './commands.js';
import { keysHelp } from '../state/keys-help.js';
import type { KeyBinding, KeyContext, KeyScope, Keymap } from '@ide/protocol';
import { keyHost } from './host.js';
import { reserved } from './reserved.js';

export type ContextResolver = () => KeyContext;

const CLIPBOARD = new Set<string>(['tree.copy', 'tree.cut', 'tree.paste']);

const CAPTURING = new Set<KeyContext>(['keys']);

const OWNING = new Set<KeyContext>(['terminal']);

const MECHANICS = inputMechanics.keys(keyHost.isMac);

const TAKEN = reserved.in(keyHost.scopes);

const SOFT_TAKEN = new Set(TAKEN.filter((item) => item.soft).map((item) => item.key));

const LEFT_ALONE = new Set(TAKEN.filter((item) => !item.soft).map((item) => item.key));

const OURS = ['meta', 'control', 'alt'];

interface Foreign {
  soft?: ReadonlySet<string>;
  left?: ReadonlySet<string>;
}

function mainFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1]!.toLowerCase();
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1]!;
  if (code === 'NumpadEnter') return 'enter';
  if (/^(Control|Shift|Alt|Meta)(Left|Right)$/.test(code)) return null;
  return code.toLowerCase();
}

const BY_CHAR: Record<string, string> = {
  '`': 'backquote',
  '~': 'backquote',
  ё: 'backquote',
  Ё: 'backquote',
  '/': 'slash',
  '?': 'slash',
};

const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const DOUBLE_TAP_MS = 400;

export class KeyRules {
  appliesHere(binding: KeyBinding, scopes: KeyScope[] = keyHost.scopes): boolean {
    if (!binding.where || binding.where.length === 0) return true;
    return binding.where.some((scope) => scopes.includes(scope));
  }

  catchesKeys(context: KeyContext): boolean {
    return CAPTURING.has(context);
  }

  swallows(key: string, clip: ReadonlySet<string>, foreign: Foreign = {}): boolean {
    const soft = foreign.soft ?? SOFT_TAKEN;
    const left = foreign.left ?? LEFT_ALONE;
    if (soft.has(key)) return true;
    if (left.has(key)) return false;
    if (clip.has(key)) return false;
    if (MECHANICS.has(key)) return false;
    return key.split('+').some((part) => OURS.includes(part));
  }

  complains(
    key: string,
    opts: { repeat: boolean; clip: ReadonlySet<string> },
  ): boolean {
    if (opts.repeat) return false;
    return this.swallows(key, opts.clip);
  }

  typedIntoField(event: KeyboardEvent): boolean {
    if (event.metaKey || event.ctrlKey || event.altKey) return false;
    const edits =
      event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete';
    if (!edits) return false;
    return isTextField(event.target);
  }

  eventToKey(event: KeyboardEvent): string | null {
    const main = event.code
      ? mainFromCode(event.code)
      : (BY_CHAR[event.key] ?? normalizeMainKey(event.key));
    if (!main) return null;

    const parts: string[] = [];
    if (event.metaKey) parts.push('meta');
    if (event.ctrlKey) parts.push('control');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    parts.push(main);
    return parts.join('+');
  }
}

export const keyRules = new KeyRules();

export class Dispatcher {
  private bindings: KeyBinding[] = [];
  private clipKeys: ReadonlySet<string> = new Set<string>();

  private holding: { key: string; clean: boolean } | null = null;
  private lastTapKey = '';
  private lastTapAt = 0;

  constructor(
    private readonly resolveContext: ContextResolver,
    private readonly onUnbound: (key: string) => void,
  ) {
    window.addEventListener('keydown', this.onKeyDown, { capture: true });
    window.addEventListener('keyup', this.onKeyUp, { capture: true });
  }

  setKeymap(keymap: Keymap): void {
    this.bindings = keymap.bindings.filter((binding) => keyRules.appliesHere(binding));
    this.clipKeys = new Set(
      this.bindings.filter((binding) => CLIPBOARD.has(binding.command)).map((b) => b.key),
    );
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown, { capture: true });
    window.removeEventListener('keyup', this.onKeyUp, { capture: true });
  }

  private fire(key: string, event: KeyboardEvent): void {
    const context = this.resolveContext();
    const own = this.bindings.find((b) => (b.when ?? 'global') === context && b.key === key);
    const binding =
      own ??
      (OWNING.has(context)
        ? undefined
        : this.bindings.find((b) => (b.when ?? 'global') === 'global' && b.key === key));

    keysHelp.echo(key, context, binding?.command ?? null);
    if (!binding) {
      if (!CAPTURING.has(context) && keyRules.complains(key, { repeat: event.repeat, clip: this.clipKeys })) {
        this.onUnbound(key);
      }
      return;
    }

    if (
      CAPTURING.has(context) &&
      (binding.when ?? 'global') !== context &&
      !commands.opensOpenPopup(binding.command)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (commands.run(binding.command)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (isBareModifier(event)) {
      const name = modifierName(event);
      this.holding ??= { key: name, clean: !hasOtherModifier(event, name) };
    } else {
      if (this.holding) this.holding.clean = false;
      this.lastTapAt = 0;
    }

    const key = keyRules.eventToKey(event);
    if (!key || keyRules.typedIntoField(event)) return;
    this.fire(key, event);
    if (!event.defaultPrevented && keyRules.swallows(key, this.clipKeys)) event.preventDefault();
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    if (!isBareModifier(event)) return;
    const name = modifierName(event);
    const pressed = this.holding;
    this.holding = null;
    if (!pressed || pressed.key !== name || !pressed.clean) {
      this.lastTapAt = 0;
      return;
    }

    const now = performance.now();
    if (this.lastTapKey === name && now - this.lastTapAt <= DOUBLE_TAP_MS) {
      this.lastTapAt = 0;
      this.fire(`double:${name}`, event);
      return;
    }
    this.lastTapKey = name;
    this.lastTapAt = now;
  };
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

function isBareModifier(event: KeyboardEvent): boolean {
  return BARE_MODIFIERS.has(event.key) || /^(Shift|Control|Alt|Meta)(Left|Right)$/.test(event.code);
}

function modifierName(event: KeyboardEvent): string {
  if (BARE_MODIFIERS.has(event.key)) return event.key.toLowerCase();
  return event.code.replace(/(Left|Right)$/, '').toLowerCase();
}

function hasOtherModifier(event: KeyboardEvent, self: string): boolean {
  return (
    (event.shiftKey && self !== 'shift') ||
    (event.ctrlKey && self !== 'control') ||
    (event.altKey && self !== 'alt') ||
    (event.metaKey && self !== 'meta')
  );
}

function normalizeMainKey(key: string): string | null {
  if (!key) return null;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;
  if (key === ' ') return 'space';
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}
