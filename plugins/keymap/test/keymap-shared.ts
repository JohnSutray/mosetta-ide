import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { KeyBinding, KeyScope, Keymap } from '@mosetta/ide-protocol';

export function keymap(): Keymap {
  return read<Keymap>('../../../server/src/config/keymap.json');
}

export function toolbarOrder(): string[] {
  return read<{ toolbar?: { order?: string[] } }>('../../../config/settings.json').toolbar?.order ?? [];
}

function read<T>(where: string): T {
  const raw = fs.readFileSync(fileURLToPath(new URL(where, import.meta.url)), 'utf8');
  const clean = raw
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(clean) as T;
}

export const WORLDS: Array<{ scope: KeyScope; host: KeyScope; isMac: boolean }> = [
  { scope: 'browser:mac', host: 'browser', isMac: true },
  { scope: 'browser:win', host: 'browser', isMac: false },
  { scope: 'electron:mac', host: 'electron', isMac: true },
  { scope: 'electron:win', host: 'electron', isMac: false },
];

export function inWorld(bindings: KeyBinding[], world: (typeof WORLDS)[number]): KeyBinding[] {
  return bindings.filter(
    (binding) =>
      !binding.where ||
      binding.where.length === 0 ||
      binding.where.includes(world.scope) ||
      binding.where.includes(world.host),
  );
}
