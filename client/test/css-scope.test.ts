import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CssScope } from '../src/state/css-scope.js';

/**
 * Plugin styles fenced in to the IDE's root, so that an embedded IDE neither restyles
 * the host page nor takes its variables.
 */
const scope = new CssScope('.mosetta-ide');

/** A sheet with its selectors taken out: what must come through untouched. */
function declarations(text: string): string[] {
  return [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]!);
}

describe('CssScope', () => {
  it('moves every selector of a list under the root', () => {
    expect(scope.apply('.button, .panel > a:hover { color: red; }')).toBe(
      '.mosetta-ide .button, .mosetta-ide .panel > a:hover { color: red; }',
    );
  });

  it('turns the page itself into the root', () => {
    expect(scope.apply(':root { --bg: #2b2b2b; }\nbody.x { margin: 0 }')).toBe(
      '.mosetta-ide { --bg: #2b2b2b; }\n.mosetta-ide.x { margin: 0 }',
    );
  });

  it('does not split on the commas inside a selector', () => {
    expect(scope.apply(':is(.a, .b) [data-x="1,2"] { top: 0 }')).toBe(
      '.mosetta-ide :is(.a, .b) [data-x="1,2"] { top: 0 }',
    );
  });

  it('copies declarations character for character', () => {
    const tick = `input[type='checkbox']:checked::after {
  border: solid var(--fg);
  border-width: 0 2px 2px 0;
}`;
    expect(scope.apply(tick)).toBe(`.mosetta-ide ${tick}`);
  });

  it('goes into media queries and leaves keyframes alone', () => {
    const text = `@media (max-width: 600px) { .a { top: 0 } }
@keyframes bob { from { top: 0 } to { top: 1px } }`;
    expect(scope.apply(text)).toBe(`@media (max-width: 600px) { .mosetta-ide .a { top: 0 } }
@keyframes bob { from { top: 0 } to { top: 1px } }`);
  });

  it('keeps every plugin stylesheet intact apart from its selectors', () => {
    const plugins = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../plugins');
    let checked = 0;
    for (const name of fs.readdirSync(plugins)) {
      const file = path.join(plugins, name, 'src', 'style.ts');
      if (!fs.existsSync(file)) continue;
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/`([^`]*)`/g)) {
        const text = m[1]!;
        if (!text.includes('{')) continue;
        expect(declarations(scope.apply(text)), name).toEqual(declarations(text));
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
});
