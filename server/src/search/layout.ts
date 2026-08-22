
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ё';
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";

const TO_EN = new Map<string, string>();
const TO_RU = new Map<string, string>();
for (let i = 0; i < RU.length; i += 1) {
  TO_EN.set(RU[i]!, EN[i]!);
  TO_RU.set(EN[i]!, RU[i]!);
}

export function retype(text: string): string | null {
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
