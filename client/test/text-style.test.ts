import { describe, expect, it } from 'vitest';
import { textStyle } from '../src/editor/darcula.js';

describe('шрифт редактора', () => {
  it('выключены — гасим И лигатуры, И контекстные альтернативы', () => {
    const style = textStyle({ fontFamily: 'JetBrains Mono', ligatures: false });
    expect(style.fontVariantLigatures).toBe('none');
    expect(style.fontFeatureSettings).toContain("'calt' 0");
  });

  it('включены — не пишем в стиль ничего лишнего', () => {
    const style = textStyle({ fontFamily: 'JetBrains Mono', ligatures: true });
    expect(style.fontVariantLigatures).toBeUndefined();
    expect(style.fontFeatureSettings).toBeUndefined();
  });

  it('имя шрифта в кавычках — в нём бывают пробелы', () => {
    expect(textStyle({ fontFamily: 'JetBrains Mono', ligatures: false }).fontFamily).toBe(
      "'JetBrains Mono', monospace",
    );
  });
});
