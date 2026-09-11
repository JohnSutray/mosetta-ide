import { describe, expect, it } from 'vitest';
import { CODE_FONT, DARCULA } from '@mosetta/ide-plugin-theme';
import { CodeLook } from '../src/look.js';

const darcula = new CodeLook({ palette: DARCULA, codeFont: CODE_FONT, dark: true });

describe('шрифт редактора', () => {
  it('выключены — гасим И лигатуры, И контекстные альтернативы', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false });
    expect(style.fontVariantLigatures).toBe('none');
    expect(style.fontFeatureSettings).toContain("'calt' 0");
  });

  it('включены — пишем включение явно', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: true });
    expect(style.fontVariantLigatures).toBe('normal');
    expect(style.fontFeatureSettings).toBe('normal');
  });

  it('имя шрифта в кавычках — в нём бывают пробелы', () => {
    expect(darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false }).fontFamily).toBe(
      "'JetBrains Mono', monospace",
    );
  });
});
