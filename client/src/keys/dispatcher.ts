import type { KeyBinding, KeyContext, Keymap } from '@ide/protocol';
import { runCommand } from './commands.js';
import { CLIP, HOST, humanizeKey, IS_MAC, MOD_IS_META } from './host.js';

export type ContextResolver = () => KeyContext;

interface Installed {
  setKeymap(keymap: Keymap): void;
  dispose(): void;
}

const BY_CODE: Record<string, string> = {
  Backquote: 'backquote',
};

const BY_CHAR: Record<string, string> = {
  '`': 'backquote',
  '~': 'backquote',
  ё: 'backquote',
  Ё: 'backquote',
};

const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);
const DOUBLE_TAP_MS = 400;

export function installDispatcher(
  resolveContext: ContextResolver,
  onBlocked: (binding: KeyBinding, reason: string) => void,
): Installed {
  let bindings: KeyBinding[] = [];

  let holding: { key: string; clean: boolean } | null = null;
  let lastTapKey = '';
  let lastTapAt = 0;

  const fire = (key: string, event: KeyboardEvent): void => {
    const context = resolveContext();
    const binding =
      bindings.find((b) => (b.when ?? 'global') === context && b.key === key) ??
      bindings.find((b) => (b.when ?? 'global') === 'global' && b.key === key);
    if (!binding) return;

    const blocked = binding.unavailable?.[HOST];
    if (blocked) {
      onBlocked(binding, blocked);
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
    if (key && !typedIntoField(event)) fire(key, event);
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
      bindings = keymap.bindings.map((binding) => ({ ...binding, key: resolveClip(binding.key) }));
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    },
  };
}

export function resolveClip(key: string): string {
  if (!key.includes('clip+')) return key;
  return key
    .split('+')
    .map((part) => (part === 'clip' ? CLIP : part))
    .join('+');
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
  const main = BY_CODE[event.code] ?? BY_CHAR[event.key] ?? normalizeMainKey(event.key);
  if (!main) return null;

  const parts: string[] = [];
  const modPressed = MOD_IS_META ? event.metaKey : event.ctrlKey;
  if (modPressed) parts.push('mod');
  if (MOD_IS_META && event.ctrlKey) parts.push('ctrl');
  if (!MOD_IS_META && IS_MAC && event.metaKey) parts.push('cmd');
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

export { humanizeKey };
