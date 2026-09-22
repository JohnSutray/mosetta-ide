import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The IDE can live inside somebody else's page, and there it must not move the page.
 *
 * `scrollIntoView` scrolls every scrolling ancestor up to the window, and `focus()`
 * scrolls the window to whatever took the focus; both dragged the host page around as
 * soon as the IDE was embedded. Plugins use `ide.mount.reveal()` and
 * `focus({ preventScroll: true })` instead. The few `focus()` calls left are on objects
 * that are not DOM elements and do their own scrolling right: CodeMirror's views and
 * xterm's terminal.
 */
const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

const NOT_DOM = [
  'instance.focus()',
  'view.focus()',
  'view.current?.focus()',
  'term.focus()',
  'this.focus.focus()',
];

function* sources(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'test') continue;
      yield* sources(at);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) yield at;
  }
}

function offences(pattern: RegExp, allowed: (line: string) => boolean): string[] {
  const out: string[] = [];
  for (const area of ['plugins', 'client/src']) {
    for (const file of sources(path.join(root, area))) {
      fs.readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, at) => {
          if (pattern.test(line) && !allowed(line)) out.push(`${path.relative(root, file)}:${at + 1}: ${line.trim()}`);
        });
    }
  }
  return out;
}

describe('an embedded IDE leaves the page where it was', () => {
  it('scrolls only its own boxes', () => {
    expect(offences(/\.scrollIntoView\(/, (line) => line.includes('EditorView.scrollIntoView('))).toEqual([]);
  });

  it('takes the focus without scrolling the page to it', () => {
    expect(offences(/\.focus\(\)/, (line) => NOT_DOM.some((one) => line.includes(one)))).toEqual([]);
  });
});
