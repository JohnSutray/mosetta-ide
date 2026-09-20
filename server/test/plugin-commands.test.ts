import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A command is declared WHERE ITS HANDLER LIVES: by a `@command` annotation on a
 * plugin's method. A distribution test reads the sources — like the passport test and
 * the border test.
 *
 * Three promises are checked, and each of them used to break silently:
 *
 * * **nobody calls `ide.command` any more**. A second way to declare a command would bring back the very ailment the annotation was invented for: the id in one place, the description in another;
 * * **`ide.commands` is left in no manifest**. That was the second list;
 * * **every command has a LABEL in the dictionary of THE SAME plugin**. The description in the annotation is for a developer; a human sees `command.<id>` from the dictionary, and its absence shows them a bare id.
 */
const plugins = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../plugins');

interface Pkg {
  name: string;
  ide?: { client?: string; strings?: string | Record<string, string>; commands?: Record<string, string> };
}

/**
 * A plugin's DEFAULT (English) dictionary.
 *
 * In the manifest, `strings` is either a string (one file, the default language) or a
 * map of language to file. We always check English: it is the base, and a hole in it is
 * a real hole rather than a "not translated yet".
 */
function defaultStrings(dir: string, manifest: { strings?: string | Record<string, string> }): Record<string, string> {
  const spec = manifest.strings;
  const file = typeof spec === 'string' ? spec : spec?.['en'];
  if (!file) return {};
  const at = path.join(plugins, dir, file);
  if (!fs.existsSync(at)) return {};
  return JSON.parse(fs.readFileSync(at, 'utf8')) as Record<string, string>;
}

/**
 * The sources of a plugin's CLIENT half.
 *
 * Selected by their import of the client contract rather than by file name: the server
 * has a `@command` decorator of its own, and that one is about an RPC method's name
 * rather than about an interface command. The names coincided, the meanings differ, and
 * without this filter the test would demand a dictionary label for a server method.
 */
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

describe('plugin commands', () => {
  it('declared by an annotation rather than by a call to ide.command', () => {
    const callers: string[] = [];
    for (const { dir, pkg } of packages()) {
      if (dir === 'api') continue;       for (const text of sourcesOf(dir)) {
        if (text.includes('ide.command(')) callers.push(pkg.name);
      }
    }
    expect([...new Set(callers)]).toEqual([]);
  });

  it('no second list of commands is left in the manifests', () => {
    const withList = packages()
      .filter(({ pkg }) => pkg.ide?.commands !== undefined)
      .map(({ pkg }) => pkg.name);
    expect(withList).toEqual([]);
  });

  it('every command has a label in its own plugin\'s dictionary', () => {
    const missing: string[] = [];
    let total = 0;
    for (const { dir, pkg } of packages()) {
      if (!pkg.ide?.client) continue;
      const strings = defaultStrings(dir, pkg.ide);
      for (const text of sourcesOf(dir)) {
        for (const hit of text.matchAll(/@command\(\s*'([^']+)'/g)) {
          total += 1;
          const id = hit[1] as string;
          if (!strings[`command.${id}`]) missing.push(`${pkg.name}: no command.${id}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(total).toBeGreaterThan(100);
  });
});
