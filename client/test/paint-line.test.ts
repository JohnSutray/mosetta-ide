import { describe, expect, it } from 'vitest';
import { paintCode } from '../src/editor/paint-line.js';
import { dc } from '../src/editor/darcula.js';

function colorOf(text: string, path: string, word: string): string | null {
  const chunk = paintCode(text, path).find((item) => item.text === word);
  return chunk ? chunk.color : 'НЕ НАЙДЕНО';
}

describe('раскраска одной строки', () => {
  it('ключевое слово, строка и тип — цветами Darcula', () => {
    const line = "const name: TestClient = 'hi';";
    expect(colorOf(line, 'a.ts', 'const')).toBe(dc.keyword);
    expect(colorOf(line, 'a.ts', "'hi'")).toBe(dc.string);
    expect(colorOf(line, 'a.ts', 'TestClient')).toBe(dc.class);
  });

  it('число и комментарий тоже свои', () => {
    expect(colorOf('let n = 42;', 'a.ts', '42')).toBe(dc.number);
    expect(colorOf('// зачем', 'a.ts', '// зачем')).toBe(dc.comment);
  });

  it('незнакомое расширение — одним куском и без цвета', () => {
    const out = paintCode('какой-то текст', 'notes.bin');
    expect(out).toEqual([{ text: 'какой-то текст', color: null }]);
  });

  it('пустая строка не роняет разбор', () => {
    expect(paintCode('', 'a.ts')).toEqual([{ text: '', color: null }]);
  });

  it('разбор одной строки не зависит от контекста файла', () => {
    const out = paintCode("  path: 'src/main.ts',", 'a.ts');
    expect(out.length).toBeGreaterThan(0);
    expect(out.map((chunk) => chunk.text).join('')).toContain('src/main.ts');
  });

  it('повторный вопрос отвечается из кеша тем же ответом', () => {
    const first = paintCode('let c: TestClient;', 'a.ts');
    expect(paintCode('let c: TestClient;', 'a.ts')).toBe(first);
  });
});
