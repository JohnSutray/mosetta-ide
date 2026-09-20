import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * We have the sheep in two places, and that is not sloppiness.
 *
 * The sheep are grazed by a plugin, but the startup splash is shown BEFORE the plugins
 * — at that moment there are none at all, and importing from there is impossible both
 * by the rules and in fact. So the core has a sprite of its own.
 *
 * A mascot that has drifted apart is two different faces for one program, and a face
 * here is not decoration. So the equality has to be guarded: a distribution test reads
 * both sources and compares the rows.
 */
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

/** The array of rows from a `const <name> = [ … ];` declaration in the source. */
function rowsOf(file: string, name: string): string[] {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const at = text.indexOf(`const ${name} = [`);
  expect(at, `in ${file} there is no declaration of ${name}`).toBeGreaterThan(-1);
  const body = text.slice(at, text.indexOf('];', at));
  return [...body.matchAll(/'([^']*)'/g)].map((hit) => hit[1] as string);
}

describe('the mascot sheep', () => {
  it('the core\'s body and the plugin\'s are one and the same', () => {
    expect(rowsOf('client/src/ui/sheep-art.ts', 'SHEEP_BODY')).toEqual(
      rowsOf('plugins/sheep/src/field.tsx', 'BODY'),
    );
  });

  it('and so are the legs: they share the step', () => {
    expect(rowsOf('client/src/ui/sheep-art.ts', 'SHEEP_LEGS')).toEqual(
      rowsOf('plugins/sheep/src/field.tsx', 'LEGS'),
    );
  });

  it('the colours of the wool, the face, the eye and the legs agree', () => {
    const core = fs.readFileSync(path.join(root, 'client/src/ui/sheep-art.ts'), 'utf8');
    const plugin = fs.readFileSync(path.join(root, 'plugins/sheep/src/field.tsx'), 'utf8');
    for (const key of ['w', 'h', 'e', 'l']) {
      const of = (text: string) => new RegExp(`(?:^|\\n)\\s*'?${key}'?:\\s*'(#[0-9a-fA-F]{3,8})'`).exec(text)?.[1];
      expect(of(core), `the colour ${key} in the core`).toBe(of(plugin));
    }
  });
});
