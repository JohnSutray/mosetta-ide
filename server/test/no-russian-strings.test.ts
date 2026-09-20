import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * There must be no Russian in the LABELS anywhere in the repository — neither as a
 * string in code nor in the default dictionary. English is the base; Russian is an
 * ordinary locale, chosen by a setting.
 *
 * This is about labels. Text a human will see has to be data: arriving from the
 * dictionary, and translatable.
 *
 * The test reads the sources, like the passport test and the border test. What it
 * catches is exactly what it all started with: Cyrillic in a STRING LITERAL. There used
 * to be a list of debt beside it, of files not yet translated; it is empty now, so the
 * expectation is simply nothing. `RUSSIAN_DUMP=1` prints whatever is found.
 */
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const CYRILLIC = /[Ѐ-ӿ]/;

/**
 * Where we look. The server and the desktop shell too: they speak into the log and into
 * dialogs.
 */
const AREAS = ['client/src', 'plugins', 'protocol/src', 'server/src', 'desktop/src'];

/**
 * Cyrillic that is NOT a label but data, and therefore legitimate.
 *
 * A keyboard layout: "йцукен…" is a description of a Russian keyboard, used for
 * searching the tree and the index. It cannot be translated — it IS the Russian
 * language as a fact about hardware.
 */
const DATA_NOT_LABELS = ['plugins/search/src/layout.ts'];

function* sources(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test') continue;
      yield* sources(at);
      continue;
    }
    if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) yield at;
  }
}

/**
 * A file's string literals, WITHOUT the comments.
 *
 * By hand rather than by parsing: a full parser for the sake of one check is a
 * dependency that would outlive its reason. We eat the comments and the template
 * literals (those hold styles and hints for developers), and then collect what is left
 * inside quotes.
 */
function literals(text: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < text.length) {
    const ch = text[at];
    if (ch === '/' && text[at + 1] === '/') {
      at = text.indexOf('\n', at);
      if (at < 0) break;
      continue;
    }
    if (ch === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      at = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === '`') {
      let i = at + 1;
      while (i < text.length && text[i] !== '`') i += text[i] === '\\' ? 2 : 1;
      at = i + 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let i = at + 1;
      let value = '';
      while (i < text.length && text[i] !== ch && text[i] !== '\n') {
        if (text[i] === '\\') {
          value += text[i + 1] ?? '';
          i += 2;
          continue;
        }
        value += text[i];
        i += 1;
      }
      out.push(value);
      at = i + 1;
      continue;
    }
    at += 1;
  }
  return out;
}

describe('the repository\'s language', () => {
  it('no Cyrillic in the code\'s string literals: labels are data', () => {
    const guilty: string[] = [];
    for (const area of AREAS) {
      const dir = path.join(root, area);
      if (!fs.existsSync(dir)) continue;
      for (const file of sources(dir)) {
        const where = path.relative(root, file);
        if (DATA_NOT_LABELS.includes(where)) continue;
        for (const value of literals(fs.readFileSync(file, 'utf8'))) {
          if (CYRILLIC.test(value)) guilty.push(where);
        }
      }
    }
    const left = [...new Set(guilty)].sort();
    if (process.env['RUSSIAN_DUMP']) console.log(JSON.stringify(left, null, 2));
    expect(left).toEqual([]);
  });

  it('no Cyrillic in the default dictionaries: en.json is English', () => {
    const guilty: string[] = [];
    const files = [path.join(root, 'client/src/i18n/en.json')];
    const plugins = path.join(root, 'plugins');
    for (const dir of fs.readdirSync(plugins)) {
      const manifest = path.join(plugins, dir, 'package.json');
      if (!fs.existsSync(manifest)) continue;
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
        ide?: { strings?: string | Record<string, string> };
      };
      const spec = pkg.ide?.strings;
      const file = typeof spec === 'string' ? spec : spec?.['en'];
      if (file) files.push(path.join(plugins, dir, file));
    }
    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      const strings = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
      for (const [key, value] of Object.entries(strings)) {
        if (CYRILLIC.test(value)) guilty.push(`${path.relative(root, file)}: ${key}`);
      }
    }
    expect(guilty).toEqual([]);
  });
});
