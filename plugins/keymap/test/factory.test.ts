import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACTORY_KEYMAP } from '../src/keymap.js';

describe('заводская раскладка', () => {
  it('заводская раскладка ссылается только на существующие команды', async () => {
    const raw = FACTORY_KEYMAP;
    const fromPlugins = await pluginCommands();
    const dead = raw.bindings.filter((b) => !fromPlugins.has(b.command));
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
