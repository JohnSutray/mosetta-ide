import { describe, expect, it } from 'vitest';
import { CODE_FONT, DARCULA } from '@mosetta/ide-plugin-theme';
import { CodeLook } from '../src/look.js';

const darcula = new CodeLook({ palette: DARCULA, codeFont: CODE_FONT, dark: true });

/**
 * The text's font rules.
 *
 * Checked here rather than by eye, for the same reason this bug took half a day to
 * find: the difference between "ligatures off" and "off by half" is invisible on
 * screen. `font-variant-ligatures: none` does not touch the contextual alternates —
 * those live in `calt` and are on by default. Forgetting the second half is easy, and
 * the consequence is invisible.
 */

describe('the editor\'s font', () => {
  it('off — we kill BOTH the ligatures AND the contextual alternates', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false });
    expect(style.fontVariantLigatures).toBe('none !important');
    expect(style.fontFeatureSettings).toContain("'calt' 0");
  });

  it('on — we write the switching-on explicitly', () => {
    const style = darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: true });
    expect(style.fontVariantLigatures).toBe('normal !important');
    expect(style.fontFeatureSettings).toBe('normal !important');
  });

  it('the font\'s name is quoted — it may contain spaces', () => {
    expect(darcula.textStyle({ fontFamily: 'JetBrains Mono', ligatures: false }).fontFamily).toBe(
      "'JetBrains Mono', monospace",
    );
  });
});
