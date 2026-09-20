import { describe, expect, it } from 'vitest';
import { CODE_FONT, DARCULA } from '@mosetta/ide-plugin-theme';
import { CodeLook } from '../src/look.js';
import { CodePainter } from '../src/paint-line.js';
import { Languages } from '../src/languages.js';
import { MethodNames } from '../src/method-names.js';

const darcula = new CodeLook({ palette: DARCULA, codeFont: CODE_FONT, dark: true });
const codePainter = new CodePainter(new Languages(new MethodNames()), () => darcula);

/**
 * A usage line looks like code.
 *
 * The test guards not the beauty but the ONE source of colours: the editor's
 * highlighting and the painting of lines are assembled from one list, and there is
 * nowhere for them to drift apart. Two schemes in one window is what must not happen,
 * and by eye it can only be noticed on a rare tag.
 */

function colorOf(text: string, path: string, word: string): string | null {
  const chunk = codePainter.paint(text, path).find((item) => item.text === word);
  return chunk ? chunk.color : 'NOT FOUND';
}

describe('painting one line', () => {
  it('a keyword, a string and a type — in Darcula\'s colours', () => {
    const line = "const name: TestClient = 'hi';";
    expect(colorOf(line, 'a.ts', 'const')).toBe(darcula.palette.keyword);
    expect(colorOf(line, 'a.ts', "'hi'")).toBe(darcula.palette.string);
    expect(colorOf(line, 'a.ts', 'TestClient')).toBe(darcula.palette.class);
  });

  it('a number and a comment get their own too', () => {
    expect(colorOf('let n = 42;', 'a.ts', '42')).toBe(darcula.palette.number);
    expect(colorOf('// why', 'a.ts', '// why')).toBe(darcula.palette.comment);
  });

  it('an unfamiliar extension — one piece, and no colour', () => {
    const out = codePainter.paint('some text', 'notes.bin');
    expect(out).toEqual([{ text: 'some text', color: null }]);
  });

  it('an empty line does not bring the parsing down', () => {
    expect(codePainter.paint('', 'a.ts')).toEqual([{ text: '', color: null }]);
  });

  it('parsing one line does not depend on the file\'s context', () => {
    const out = codePainter.paint("  path: 'src/main.ts',", 'a.ts');
    expect(out.length).toBeGreaterThan(0);
    expect(out.map((chunk) => chunk.text).join('')).toContain('src/main.ts');
  });

  it('a repeated question is answered from the cache with the same answer', () => {
    const first = codePainter.paint('let c: TestClient;', 'a.ts');
    expect(codePainter.paint('let c: TestClient;', 'a.ts')).toBe(first);
  });
});
