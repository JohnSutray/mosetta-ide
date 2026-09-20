import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const plugins = path.resolve(here, '../../plugins');
const core = path.resolve(here, '../../client/src/i18n/en.json');

interface Pkg {
  name: string;
  ide?: { client?: string; strings?: string | Record<string, string> };
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

function defaultStrings(dir: string, manifest: { strings?: string | Record<string, string> }): Record<string, string> {
  const spec = manifest.strings;
  const file = typeof spec === 'string' ? spec : spec?.['en'];
  if (!file) return {};
  const at = path.join(plugins, dir, file);
  if (!fs.existsSync(at)) return {};
  return JSON.parse(fs.readFileSync(at, 'utf8')) as Record<string, string>;
}

function sourcesOf(dir: string): Array<{ file: string; text: string }> {
  const src = path.join(plugins, dir, 'src');
  if (!fs.existsSync(src)) return [];
  return fs
    .readdirSync(src)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .map((file) => ({ file, text: fs.readFileSync(path.join(src, file), 'utf8') }))
    .filter((one) => one.text.includes("from '@mosetta/ide-api/client'"));
}

const DERIVED = /^(command|settings|panel|toolbar|plugin)\./;

describe('надписи плагинов', () => {
  it('у каждого литерального ключа есть надпись в словаре', () => {
    const known = new Set<string>(Object.keys(JSON.parse(fs.readFileSync(core, 'utf8')) as Record<string, string>));
    for (const { dir, pkg } of packages()) {
      if (!pkg.ide) continue;
      for (const key of Object.keys(defaultStrings(dir, pkg.ide))) known.add(key);
    }

    const missing: string[] = [];
    let total = 0;
    for (const { dir, pkg } of packages()) {
      if (!pkg.ide?.client) continue;
      for (const { file, text } of sourcesOf(dir)) {
        for (const hit of text.matchAll(/\bt\(\s*'([a-z][\w.]*)'/gi)) {
          const key = hit[1] as string;
          if (DERIVED.test(key)) continue;
          total += 1;
          if (!known.has(key)) missing.push(`${pkg.name}/${file}: нет надписи ${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(total, 'тест зелёный только потому, что ничего не нашёл').toBeGreaterThan(100);
  });
});
