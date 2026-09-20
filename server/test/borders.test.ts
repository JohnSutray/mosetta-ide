import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BORDER_DEBT } from './borders.debt.js';

/**
 * A package's border is an instance.
 *
 * One package's code reaches another's only through an instance: the core through
 * `ide`, a plugin through `ide.getPlugin(X)` and onwards through its fields. An
 * `import` from somebody else's package is free only for what is not behaviour:
 *
 * * types (`import type`, `type X` — erased at build time);
 * * a plugin's default class — that is the key for `getPlugin`;
 * * the contract's vocabulary — the annotations a plugin declares its own things with.
 *
 * Everything else — classes, components, enums, constants — goes BY PERMIT: the name is
 * written into the source package's `ide.shares`. The core walks freely inside itself,
 * and does not walk into plugins at all: it has to come up without them.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The core: the wire, the session, the plugin operator and the contract. */
const CORE = new Set(['@mosetta/ide-protocol', '@mosetta/ide-api', '@mosetta/ide-client', '@mosetta/ide-server']);

/**
 * The contract's vocabulary — declaring your own rather than calling somebody else's.
 * The list is closed: a name from the contract that DOES something (`project`,
 * `settings`, `t`) is a service, and its place is on `ide`.
 */
const LANGUAGE: Record<string, readonly string[]> = {
  '@mosetta/ide-api': [
    'activate',
    'command',
    'configSection',
    'IdeProvider',
    'plugin',
    'PROJECT_LAYER',
    'registry',
    'remote',
    'inLayerOrder',
    'settingsKey',
    'stub',
    'useIde',
    'USER_LAYER',
    'useT',
  ],
  '@mosetta/ide-protocol': ['RpcErrorCode'],
};

interface Pkg {
  name: string;
  dir: string;
  plugin: boolean;
  shares: readonly string[];
}

function packages(): Pkg[] {
  const dirs = ['protocol', 'client', 'server'].concat(
    fs.readdirSync(path.join(ROOT, 'plugins')).map((name) => path.join('plugins', name)),
  );
  const out: Pkg[] = [];
  for (const dir of dirs) {
    const file = path.join(ROOT, dir, 'package.json');
    if (!fs.existsSync(file)) continue;
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      name: string;
      ide?: { shares?: string[] };
    };
    out.push({ name: pkg.name, dir, plugin: pkg.ide !== undefined, shares: pkg.ide?.shares ?? [] });
  }
  return out;
}

function sources(dir: string): string[] {
  const root = path.join(ROOT, dir, 'src');
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (at: string): void => {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const full = path.join(at, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/** What is taken from the source package: `default`, a name, or `*`; types do not count. */
function taken(spec: string): string[] {
  const text = spec.trim();
  if (text.startsWith('type ')) return [];
  if (text.startsWith('*')) return ['*'];
  const names: string[] = [];
  const braces = /\{([^}]*)\}/.exec(text);
  const head = text.replace(/\{[^}]*\}/, '').replace(/,/g, ' ').trim();
  if (head && !head.startsWith('*')) names.push('default');
  if (/\*\s+as\s+\w+/.test(head)) names.push('*');
  for (const item of braces?.[1]?.split(',') ?? []) {
    const one = item.trim();
    if (!one || one.startsWith('type ')) continue;
    const name = one.split(/\s+as\s+/)[0]!.trim();
    names.push(name === 'default' ? 'default' : name);
  }
  return names;
}

function scan(): string[] {
  const all = packages();
  const byName = new Map(all.map((pkg) => [pkg.name, pkg]));
  const found = new Set<string>();
  for (const pkg of all) {
    for (const file of sources(pkg.dir)) {
      const text = fs.readFileSync(file, 'utf8');
      const uses: Array<[string, string]> = [];
      for (const [, spec, from] of text.matchAll(/^(?:import|export)\s+([^;]*?)\s+from\s+'(@mosetta\/ide-[^']+)'/gm)) {
        for (const name of taken(spec!)) uses.push([from!, name]);
      }
      for (const [, from] of text.matchAll(/^import\s+'(@mosetta\/ide-[^']+)'/gm)) uses.push([from!, '(import)']);
      for (const [from, name] of uses) {
        const source = byName.get(from.split('/').slice(0, 2).join('/'));
        if (!source || source.name === pkg.name) continue;
        if (CORE.has(pkg.name) && CORE.has(source.name)) continue;
        const allowed =
          !CORE.has(pkg.name) &&
          ((name === 'default' && source.plugin) ||
            (LANGUAGE[source.name] ?? []).includes(name) ||
            source.shares.includes(name));
        if (!allowed) found.add(`${pkg.name} → ${source.name}: ${name}`);
      }
    }
  }
  return [...found].sort();
}

describe('a package\'s border is an instance', () => {
  const found = scan();
  const debt = new Set(BORDER_DEBT);

  if (process.env['BORDER_DUMP']) {
    console.log(`BORDER_DUMP ${JSON.stringify(found, null, 2)}`);
  }

  it('no new way round an instance: through ide, getPlugin or a permit in ide.shares', () => {
    expect(found.filter((one) => !debt.has(one))).toEqual([]);
  });

  it('a debt that was paid is struck off borders.debt.ts — the list only shrinks', () => {
    expect(BORDER_DEBT.filter((one) => !found.includes(one))).toEqual([]);
  });

  it('the parsing sees every form of import', () => {
    expect(taken("{ a, type B, c as d }")).toEqual(['a', 'c']);
    expect(taken('Plugin, { x }')).toEqual(['default', 'x']);
    expect(taken('* as all')).toEqual(['*']);
    expect(taken('type { T }')).toEqual([]);
    expect(taken('{ default as Other }')).toEqual(['default']);
  });
});
