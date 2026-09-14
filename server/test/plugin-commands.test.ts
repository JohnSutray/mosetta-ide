import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const plugins = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../plugins');

interface Pkg {
  name: string;
  ide?: { client?: string; strings?: string | Record<string, string>; commands?: Record<string, string> };
}

function defaultStrings(dir: string, manifest: { strings?: string | Record<string, string> }): Record<string, string> {
  const spec = manifest.strings;
  const file = typeof spec === 'string' ? spec : spec?.['en'];
  if (!file) return {};
  const at = path.join(plugins, dir, file);
  if (!fs.existsSync(at)) return {};
  return JSON.parse(fs.readFileSync(at, 'utf8')) as Record<string, string>;
}

function sourcesOf(dir: string): string[] {
  const src = path.join(plugins, dir, 'src');
  if (!fs.existsSync(src)) return [];
  return fs
    .readdirSync(src)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .map((file) => fs.readFileSync(path.join(src, file), 'utf8'))
    .filter((text) => text.includes("from '@mosetta/ide-api/client'"));
}

function packages(): Array<{ dir: string; pkg: Pkg }> {
  const out: Array<{ dir: string; pkg: Pkg }> = [];
  for (const dir of fs.readdirSync(plugins)) {
    const file = path.join(plugins, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    out.push({ dir, pkg: JSON.parse(fs.readFileSync(file, 'utf8')) as Pkg });
  }
  return out;
}

describe('команды плагинов', () => {
  it('объявлены аннотацией, а не вызовом ide.command', () => {
    const callers: string[] = [];
    for (const { dir, pkg } of packages()) {
      if (dir === 'api') continue;
      for (const text of sourcesOf(dir)) {
        if (text.includes('ide.command(')) callers.push(pkg.name);
      }
    }
    expect([...new Set(callers)]).toEqual([]);
  });

  it('в манифестах не осталось второго списка команд', () => {
    const withList = packages()
      .filter(({ pkg }) => pkg.ide?.commands !== undefined)
      .map(({ pkg }) => pkg.name);
    expect(withList).toEqual([]);
  });

  it('у каждой команды есть надпись в словаре своего плагина', () => {
    const missing: string[] = [];
    let total = 0;
    for (const { dir, pkg } of packages()) {
      if (!pkg.ide?.client) continue;
      const strings = defaultStrings(dir, pkg.ide);
      for (const text of sourcesOf(dir)) {
        for (const hit of text.matchAll(/@command\(\s*'([^']+)'/g)) {
          total += 1;
          const id = hit[1] as string;
          if (!strings[`command.${id}`]) missing.push(`${pkg.name}: нет command.${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(total).toBeGreaterThan(100);
  });
});
