import { keyContexts } from '../src/context.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FACTORY_KEYMAP } from '../src/keymap.js';
import type { Keymap } from '../src/types.js';

const SRC = fileURLToPath(new URL('../../../client/src', import.meta.url));
const PLUGINS = fileURLToPath(new URL('../..', import.meta.url));

/** The sources of every plugin in the build: each has a `src` of its own. */
function pluginSources(): string[] {
  return fs
    .readdirSync(PLUGINS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(PLUGINS, entry.name, 'src')))
    .flatMap((entry) => sources(path.join(PLUGINS, entry.name, 'src')));
}
const PROTOCOL = fileURLToPath(new URL('../src/types.ts', import.meta.url));

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.tsx?$/.test(entry.name) ? [fs.readFileSync(full, 'utf8')] : [];
  });
}

/**
 * The names surfaces call themselves by: `data-keys`, and `keys` on popups. Plus one
 * context with no surface — `editable`: it comes from the sheer fact that the focus is
 * in an input field, and there is no naming yourself with it.
 */
function declared(): Set<string> {
  const found = new Set<string>(['editable']);
  for (const text of [...sources(SRC), ...pluginSources()]) {
    for (const [, name] of text.matchAll(/\bdata-keys="([\w-]+)"/g)) if (name) found.add(name);
    for (const [, name] of text.matchAll(/\bkeys="([\w-]+)"/g)) if (name) found.add(name);
    for (const [, name] of text.matchAll(/\bkeys:\s*'([\w-]+)'/g)) if (name) found.add(name);
    for (const [, names] of text.matchAll(/'data-keys':\s*'([\w\s-]+)'/g)) {
      for (const name of names?.split(/\s+/) ?? []) if (name) found.add(name);
    }
  }
  return found;
}

/** The layout is now the plugin's CODE — we take it as it is. */
function keymap(): Keymap {
  return FACTORY_KEYMAP;
}

/** The members of the `KeyContext` union — the registry of every surface. */
function registry(): Set<string> {
  const text = fs.readFileSync(PROTOCOL, 'utf8');
  const block = /export type KeyContext =([\s\S]*?);/.exec(text)?.[1] ?? '';
  return new Set([...block.matchAll(/'([\w-]+)'/g)].map((m) => m[1]!));
}

describe('the keys\' contexts', () => {
  it('every binding has a surface that calls itself that', () => {
    const surfaces = declared();
    const orphans = keymap()
      .bindings.map((b) => b.when ?? 'global')
      .filter((when) => when !== 'global' && !surfaces.has(when));
    expect([...new Set(orphans)], 'contexts with no surface — the keys are dead').toEqual([]);
  });

  it('a surface cannot call itself a context that is not in the registry', () => {
    const known = registry();
    const unknown = [...declared()].filter((name) => !known.has(name));
    expect(unknown, 'not in KeyContext').toEqual([]);
  });

  it('the context is taken from the focused element, otherwise global', () => {
    const surface = { getAttribute: () => 'prompt' } as unknown as Element;
    const focused = { closest: () => surface } as unknown as Element;
    expect(keyContexts.of(focused)).toBe('prompt');

    const loner = { closest: () => null } as unknown as Element;
    expect(keyContexts.of(loner)).toBe('global');
    expect(keyContexts.of(null)).toBe('global');
  });

  it('a surface may name a chain: its own first, what it lacks from the next one', () => {
    const surface = { getAttribute: () => 'completion editor' } as unknown as Element;
    const focused = { closest: () => surface } as unknown as Element;
    expect(keyContexts.chain(focused)).toEqual(['completion', 'editor']);
    expect(keyContexts.of(focused)).toBe('completion');
    expect(keyContexts.chain(null)).toEqual(['global']);
  });
});
