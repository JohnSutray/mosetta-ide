import { describe, expect, it } from 'vitest';
import { codePainter } from '@ide/code';
import { darcula } from '@ide/code';

function colorOf(text: string, path: string, word: string): string | null {
  const chunk = codePainter.paint(text, path).find((item) => item.text === word);
  return chunk ? chunk.color : 'НЕ НАЙДЕНО';
}

describe('раскраска одной строки', () => {
  it('ключевое слово, строка и тип — цветами Darcula', () => {
    const line = "const name: TestClient = 'hi';";
    expect(colorOf(line, 'a.ts', 'const')).toBe(darcula.palette.keyword);
    expect(colorOf(line, 'a.ts', "'hi'")).toBe(darcula.palette.string);
    expect(colorOf(line, 'a.ts', 'TestClient')).toBe(darcula.palette.class);
  });

  it('число и комментарий тоже свои', () => {
    expect(colorOf('let n = 42;', 'a.ts', '42')).toBe(darcula.palette.number);
    expect(colorOf('// зачем', 'a.ts', '// зачем')).toBe(darcula.palette.comment);
  });

  it('незнакомое расширение — одним куском и без цвета', () => {
    const out = codePainter.paint('какой-то текст', 'notes.bin');
    expect(out).toEqual([{ text: 'какой-то текст', color: null }]);
  });

  it('пустая строка не роняет разбор', () => {
    expect(codePainter.paint('', 'a.ts')).toEqual([{ text: '', color: null }]);
  });

  it('разбор одной строки не зависит от контекста файла', () => {
    const out = codePainter.paint("  path: 'src/main.ts',", 'a.ts');
    expect(out.length).toBeGreaterThan(0);
    expect(out.map((chunk) => chunk.text).join('')).toContain('src/main.ts');
  });

  it('повторный вопрос отвечается из кеша тем же ответом', () => {
    const first = codePainter.paint('let c: TestClient;', 'a.ts');
    expect(codePainter.paint('let c: TestClient;', 'a.ts')).toBe(first);
  });
});
