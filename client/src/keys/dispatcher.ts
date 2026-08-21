import type { KeyBinding, KeyContext, Keymap } from '@ide/protocol';
import { runCommand } from './commands.js';
import { HOST, humanizeKey, IS_MAC } from './host.js';

export type ContextResolver = () => KeyContext;

interface Installed {
  setKeymap(keymap: Keymap): void;
  dispose(): void;
}

export function installDispatcher(
  resolveContext: ContextResolver,
  onBlocked: (binding: KeyBinding, reason: string) => void,
): Installed {
  let bindings: KeyBinding[] = [];

  const onKeyDown = (event: KeyboardEvent) => {
    const key = eventToKey(event);
    if (!key) return;

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

  window.addEventListener('keydown', onKeyDown, { capture: true });

  return {
    setKeymap(keymap) {
      bindings = keymap.bindings;
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    },
  };
}

export function eventToKey(event: KeyboardEvent): string | null {
  const main = normalizeMainKey(event.key);
  if (!main) return null;

  const parts: string[] = [];
  const modPressed = IS_MAC ? event.metaKey : event.ctrlKey;
  if (modPressed) parts.push('mod');
  if (event.ctrlKey && IS_MAC) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');
  parts.push(main);
  return parts.join('+');
}

function normalizeMainKey(key: string): string | null {
  if (!key) return null;
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) return null;
  if (key === ' ') return 'space';
  if (key.length === 1) return key.toLowerCase();
  return key.toLowerCase();
}

export { humanizeKey };
