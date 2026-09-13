import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCommandId } from '@mosetta/ide-protocol';
import { FACTORY_KEYMAP } from '../src/keymap.js';

describe('заводская раскладка', () => {
  it('заводская раскладка ссылается только на существующие команды', async () => {
    const raw = FACTORY_KEYMAP;
    const fromPlugins = await pluginCommands();
    const dead = raw.bindings.filter(
      (b) => !isCommandId(b.command) && !fromPlugins.has(b.command),
    );
    expect(dead, `мёртвые клавиши: ${dead.map((d) => d.key).join(', ')}`).toEqual([]);
  });

  it('в поставке нет строк-снятий: снимать у себя же нечего', () => {
    expect(FACTORY_KEYMAP.bindings.filter((one) => one.remove)).toEqual([]);
  });
});

async function pluginCommands(): Promise<Set<string>> {
  const dir = fileURLToPath(new URL('../..', import.meta.url));
  const out = new Set<string>();
  for (const name of await fs.readdir(dir).catch(() => [] as string[])) {
    const raw = await fs.readFile(path.join(dir, name, 'package.json'), 'utf8').catch(() => null);
    if (!raw) continue;
    const pkg = JSON.parse(raw) as { ide?: { commands?: Record<string, string> } };
    for (const id of Object.keys(pkg.ide?.commands ?? {})) out.add(id);
  }
  return out;
}
