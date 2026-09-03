import { describe, expect, it } from 'vitest';
import { darcula } from '@ide/code';

describe('шрифт редактора', () => {
  it('выключены — гасим И лигатуры, И контекстные альтернативы', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false });
    expect(style.fontVariantLigatures).toBe('none');
    expect(style.fontFeatureSettings).toContain("'calt' 0");
  });

  it('включены — не пишем в стиль ничего лишнего', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: true });
    expect(style.fontVariantLigatures).toBeUndefined();
    expect(style.fontFeatureSettings).toBeUndefined();
  });

  it('имя шрифта в кавычках — в нём бывают пробелы', () => {
    expect(darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false }).fontFamily).toBe(
      "'JetBrains Mono', monospace",
    );
  });
});
