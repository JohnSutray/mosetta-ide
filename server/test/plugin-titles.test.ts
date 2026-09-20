import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A plugin's passport is a requirement on the class: every bundled plugin has a
 * human-readable name, and its key lies in the plugin's dictionary. A distribution
 * test: it reads the sources, like the border test.
 */
const plugins = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../plugins');

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

describe('plugin passports', () => {
  it('every bundled plugin has @plugin({ title }) and a label in its dictionary', () => {
    const missing: string[] = [];
    for (const dir of fs.readdirSync(plugins)) {
      const file = path.join(plugins, dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
        name: string;
        ide?: { client?: string; strings?: string | Record<string, string> };
      };
      if (!pkg.ide?.client) continue;
      const source = fs.readFileSync(path.join(plugins, dir, pkg.ide.client), 'utf8');
      const title = /@plugin\(\{\s*title:\s*'([^']+)'\s*\}\)/.exec(source)?.[1];
      if (!title) {
        missing.push(`${pkg.name}: no @plugin({ title })`);
        continue;
      }
      const strings = defaultStrings(dir, pkg.ide);
      if (!strings[title]) missing.push(`${pkg.name}: the key «${title}» is not in the dictionary`);
    }
    expect(missing).toEqual([]);
  });

  it('every declared settings section has a schema for its value', () => {
    const missing: string[] = [];
    for (const dir of fs.readdirSync(plugins)) {
      const file = path.join(plugins, dir, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name: string; ide?: { client?: string } };
      if (!pkg.ide?.client) continue;
      const source = fs.readFileSync(path.join(plugins, dir, pkg.ide.client), 'utf8');
      for (const found of source.matchAll(/@configSection\(\{([^}]*)\}\)/g)) {
        const spec = found[1] ?? '';
        const section = /section:\s*'([^']+)'/.exec(spec)?.[1] ?? '?';
        if (!/schema:\s*\w+/.test(spec)) missing.push(`${pkg.name}: section «${section}» has no schema for its value`);
      }
    }
    expect(missing).toEqual([]);
  });
});
