import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A label missing from the dictionary shows a human THE KEY.
 *
 * Found by a live check: the "diverged from disk" strip was showing
 * `docs.diverged.changed`, `docs.diverged.reload`, `docs.diverged.discard` — in the
 * editor's dictionary those keys lay without the `docs.` prefix while the code asked
 * for them with it. For six months the strip looked like a breakage at exactly the
 * moment it is needed most: when a file has diverged from disk.
 *
 * A distribution test, like the command test: it reads the sources and the
 * dictionaries. Only a LITERAL key is checked — `t('some.key')`: a key assembled from
 * pieces cannot be checked, and we are not going to lie about that (the counter at the
 * bottom guards against "green because we found nothing").
 *
 * A key is looked for in ALL the dictionaries at once rather than only in its own: a
 * plugin is entitled to show somebody else's label (the layout draws its neighbours'
 * panel names), and "whose key is this" is not this test's question.
 */
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

/** The default (English) dictionary: it is the base, so a hole in it is a real one. */
function defaultStrings(dir: string, manifest: { strings?: string | Record<string, string> }): Record<string, string> {
  const spec = manifest.strings;
  const file = typeof spec === 'string' ? spec : spec?.['en'];
  if (!file) return {};
  const at = path.join(plugins, dir, file);
  if (!fs.existsSync(at)) return {};
  return JSON.parse(fs.readFileSync(at, 'utf8')) as Record<string, string>;
}

/** The client half's sources: the server half has no dictionary of its own. */
function sourcesOf(dir: string): Array<{ file: string; text: string }> {
  const src = path.join(plugins, dir, 'src');
  if (!fs.existsSync(src)) return [];
  return fs
    .readdirSync(src)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
    .map((file) => ({ file, text: fs.readFileSync(path.join(src, file), 'utf8') }))
    .filter((one) => one.text.includes("from '@mosetta/ide-api/client'"));
}

/**
 * Keys ASSEMBLED by a rule rather than written by hand: `command.<id>` has its own
 * test, and `settings.<section>.<key>` belongs to the settings screen. Here they would
 * show up as a literal prefix.
 */
const DERIVED = /^(command|settings|panel|toolbar|plugin)\./;

describe('plugin labels', () => {
  it('every literal key has a label in some dictionary', () => {
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
          if (!known.has(key)) missing.push(`${pkg.name}/${file}: no label ${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(total, 'the test is green only because it found nothing').toBeGreaterThan(100);
  });
});
