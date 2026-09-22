import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_KEYMAP } from '../src/keymap.js';

/**
 * The factory layout is the PLUGIN's DATA: it travels with the plugin, while the
 * user's file holds only their own differences. A distribution test: what we ship is
 * obliged to call commands that exist.
 */
describe('the factory layout', () => {
  it('the factory layout refers only to commands that exist', async () => {
    const raw = FACTORY_KEYMAP;
    const fromPlugins = await pluginCommands();
    const dead = raw.bindings.filter((b) => !fromPlugins.has(b.command));
    expect(dead, `dead keys: ${dead.map((d) => d.key).join(', ')}`).toEqual([]);
  });

  it('there are no removal rows in the shipment: there is nothing of our own to remove', () => {
    expect(FACTORY_KEYMAP.bindings.filter((one) => one.remove)).toEqual([]);
  });
});

/**
 * Plugins' commands come from their sources.
 *
 * Manifests used to be read: a command's id lay in `package.json` and the handler in
 * the code, and they were obliged to agree on their honour. Now there is nothing left
 * to agree: the declaration is ONE, an annotation on a method, and it can be found
 * where it is written. We look for the literal: the first argument of `@command` is
 * always a string, or the layout would have nothing to refer to.
 */
async function pluginCommands(): Promise<Set<string>> {
  const dir = fileURLToPath(new URL('../..', import.meta.url));
  const out = new Set<string>();
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const src = path.join(dir, name, 'src');
    for (const file of await fs.readdir(src).catch(() => [] as string[])) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const text = await fs.readFile(path.join(src, file), 'utf8').catch(() => '');
      if (!text.includes("from '@mosetta/ide-api/client'")) continue;
      for (const hit of text.matchAll(/@command\(\s*'([^']+)'/g)) out.add(hit[1] as string);
    }
  }
  return out;
}
