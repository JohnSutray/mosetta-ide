import { keyContexts } from '../src/context.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FACTORY_KEYMAP } from '../src/keymap.js';
import type { Keymap } from '../src/types.js';

const SRC = fileURLToPath(new URL('../../../client/src', import.meta.url));
const PLUGINS = fileURLToPath(new URL('../..', import.meta.url));

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

function declared(): Set<string> {
  const found = new Set<string>(['editable']);
  for (const text of [...sources(SRC), ...pluginSources()]) {
    for (const [, name] of text.matchAll(/\bdata-keys="([\w-]+)"/g)) if (name) found.add(name);
    for (const [, name] of text.matchAll(/\bkeys="([\w-]+)"/g)) if (name) found.add(name);
    for (const [, names] of text.matchAll(/'data-keys':\s*'([\w\s-]+)'/g)) {
      for (const name of names?.split(/\s+/) ?? []) if (name) found.add(name);
    }
  }
  return found;
}

function keymap(): Keymap {
  return FACTORY_KEYMAP;
}

function registry(): Set<string> {
  const text = fs.readFileSync(PROTOCOL, 'utf8');
  const block = /export type KeyContext =([\s\S]*?);/.exec(text)?.[1] ?? '';
  return new Set([...block.matchAll(/'([\w-]+)'/g)].map((m) => m[1]!));
}

describe('контексты клавиш', () => {
  it('у каждого биндинга есть поверхность, которая себя так называет', () => {
    const surfaces = declared();
    const orphans = keymap()
      .bindings.map((b) => b.when ?? 'global')
      .filter((when) => when !== 'global' && !surfaces.has(when));
    expect([...new Set(orphans)], 'контексты без поверхности — клавиши мертвы').toEqual([]);
  });

  it('поверхность не может назваться контекстом, которого нет в реестре', () => {
    const known = registry();
    const unknown = [...declared()].filter((name) => !known.has(name));
    expect(unknown, 'нет в KeyContext').toEqual([]);
  });

  it('контекст берётся у сфокусированного элемента, иначе — global', () => {
    const surface = { getAttribute: () => 'prompt' } as unknown as Element;
    const focused = { closest: () => surface } as unknown as Element;
    expect(keyContexts.of(focused)).toBe('prompt');

    const loner = { closest: () => null } as unknown as Element;
    expect(keyContexts.of(loner)).toBe('global');
    expect(keyContexts.of(null)).toBe('global');
  });

  it('поверхность может назвать цепочку: своё первым, чего нет — у следующего (ADR-0200)', () => {
    const surface = { getAttribute: () => 'completion editor' } as unknown as Element;
    const focused = { closest: () => surface } as unknown as Element;
    expect(keyContexts.chain(focused)).toEqual(['completion', 'editor']);
    expect(keyContexts.of(focused)).toBe('completion');
    expect(keyContexts.chain(null)).toEqual(['global']);
  });
});
