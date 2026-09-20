/**
 * Transliteration BY KEYBOARD LAYOUT.
 *
 * A human searches for `func` without looking at the keyboard and gets `агтс`. That is
 * neither a typo nor another language — those are the same keys, the system simply read
 * them with another layout. So we are obliged to read them with both.
 *
 * The table is keyboard geometry rather than a transliteration of sounds: `ф` is `a`
 * because they are on one key rather than because they look alike. For exactly the same
 * reason the key under Escape is called `backquote`.
 */

const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ё';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";

const TO_EN = new Map<string, string>();
const TO_RU = new Map<string, string>();
for (let i = 0; i < RU.length; i += 1) {
  TO_EN.set(RU[i]!, EN[i]!);
  TO_RU.set(EN[i]!, RU[i]!);
}

/** The keyboard layout: a query typed in the wrong one. */
export class Layout {
  /**
   * What this set of keys would look like in the other layout. `null` means not one
   * letter translates (digits, paths), so there is no second variant either.
   */
  retype(text: string): string | null {
    const cyrillic = /[а-яё]/i.test(text);
    const table = cyrillic ? TO_EN : TO_RU;
    let out = '';
    let touched = false;
    for (const ch of text) {
      const lower = ch.toLowerCase();
      const mapped = table.get(lower);
      if (mapped === undefined) {
        out += ch;
        continue;
      }
      out += ch === lower ? mapped : mapped.toUpperCase();
      touched = true;
    }
    return touched && out !== text ? out : null;
  }
}

/** One per process: a table of letters, with no state. */
export const layout = new Layout();
