import type { KeyBinding, KeyContext, KeyScope, Keymap } from '@ide/protocol';
import { opensOpenPopup, runCommand } from './commands.js';
import { echoKey } from '../state/keys-help.js';
import { mechanicsKeys } from '../editor/input-keymap.js';
import { keyHost } from './host.js';
import { reservedIn } from './reserved.js';

export type ContextResolver = () => KeyContext;

export function appliesHere(binding: KeyBinding, scopes: KeyScope[] = keyHost.scopes): boolean {
  if (!binding.where || binding.where.length === 0) return true;
  return binding.where.some((scope) => scopes.includes(scope));
}

const CLIPBOARD = new Set<string>(['tree.copy', 'tree.cut', 'tree.paste']);

const CAPTURING = new Set<KeyContext>(['keys']);

export function catchesKeys(context: KeyContext): boolean {
  return CAPTURING.has(context);
}

const OWNING = new Set<KeyContext>(['terminal']);

const MECHANICS = mechanicsKeys(keyHost.isMac);

const TAKEN = reservedIn(keyHost.scopes);

const SOFT_TAKEN = new Set(TAKEN.filter((item) => item.soft).map((item) => item.key));

const LEFT_ALONE = new Set(TAKEN.filter((item) => !item.soft).map((item) => item.key));

const OURS = ['meta', 'control', 'alt'];

interface Foreign {
  soft?: ReadonlySet<string>;
  left?: ReadonlySet<string>;
}

export function swallows(key: string, clip: ReadonlySet<string>, foreign: Foreign = {}): boolean {
  const soft = foreign.soft ?? SOFT_TAKEN;
  const left = foreign.left ?? LEFT_ALONE;
  if (soft.has(key)) return true;
  if (left.has(key)) return false;
  if (clip.has(key)) return false;
  if (MECHANICS.has(key)) return false;
  return key.split('+').some((part) => OURS.includes(part));
}

export function complains(
  key: string,
  opts: { repeat: boolean; clip: ReadonlySet<string> },
): boolean {
  if (opts.repeat) return false;
  return swallows(key, opts.clip);
}

interface Installed {
  setKeymap(keymap: Keymap): void;
  dispose(): void;
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

export function installDispatcher(
  resolveContext: ContextResolver,
  onUnbound: (key: string) => void,
): Installed {
  let bindings: KeyBinding[] = [];
  let clipKeys: ReadonlySet<string> = new Set<string>();

  let holding: { key: string; clean: boolean } | null = null;
  let lastTapKey = '';
  let lastTapAt = 0;

  const fire = (key: string, event: KeyboardEvent): void => {
    const context = resolveContext();
    const own = bindings.find((b) => (b.when ?? 'global') === context && b.key === key);
    const binding =
      own ??
      (OWNING.has(context)
        ? undefined
        : bindings.find((b) => (b.when ?? 'global') === 'global' && b.key === key));

    echoKey(key, context, binding?.command ?? null);
    if (!binding) {
      if (!CAPTURING.has(context) && complains(key, { repeat: event.repeat, clip: clipKeys })) {
        onUnbound(key);
      }
      return;
    }

    if (
      CAPTURING.has(context) &&
      (binding.when ?? 'global') !== context &&
      !opensOpenPopup(binding.command)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (runCommand(binding.command)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (isBareModifier(event)) {
      const name = modifierName(event);
      holding ??= { key: name, clean: !hasOtherModifier(event, name) };
    } else {
      if (holding) holding.clean = false;
      lastTapAt = 0;
    }

    const key = eventToKey(event);
    if (!key || typedIntoField(event)) return;
    fire(key, event);
    if (!event.defaultPrevented && swallows(key, clipKeys)) event.preventDefault();
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!isBareModifier(event)) return;
    const name = modifierName(event);
    const pressed = holding;
    holding = null;
    if (!pressed || pressed.key !== name || !pressed.clean) {
      lastTapAt = 0;
      return;
    }

    const now = performance.now();
    if (lastTapKey === name && now - lastTapAt <= DOUBLE_TAP_MS) {
      lastTapAt = 0;
      fire(`double:${name}`, event);
      return;
    }
    lastTapKey = name;
    lastTapAt = now;
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  return {
    setKeymap(keymap) {
      bindings = keymap.bindings.filter((binding) => appliesHere(binding));
      clipKeys = new Set(
        bindings.filter((binding) => CLIPBOARD.has(binding.command)).map((b) => b.key),
      );
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    },
  };
}

export function typedIntoField(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const edits =
    event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete';
  if (!edits) return false;
  return isTextField(event.target);
}

function isTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

export function eventToKey(event: KeyboardEvent): string | null {
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
