import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

function rowsOf(file: string, name: string): string[] {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const at = text.indexOf(`const ${name} = [`);
  expect(at, `в ${file} нет объявления ${name}`).toBeGreaterThan(-1);
  const body = text.slice(at, text.indexOf('];', at));
  return [...body.matchAll(/'([^']*)'/g)].map((hit) => hit[1] as string);
}

describe('овца-маскот', () => {
  it('тело у ядра и у плагина одно и то же', () => {
    expect(rowsOf('client/src/ui/sheep-art.ts', 'SHEEP_BODY')).toEqual(
      rowsOf('plugins/sheep/src/field.tsx', 'BODY'),
    );
  });

  it('и ноги тоже: шаг у них общий', () => {
    expect(rowsOf('client/src/ui/sheep-art.ts', 'SHEEP_LEGS')).toEqual(
      rowsOf('plugins/sheep/src/field.tsx', 'LEGS'),
    );
  });

  it('цвета шерсти, морды, глаза и ноги совпадают', () => {
    const core = fs.readFileSync(path.join(root, 'client/src/ui/sheep-art.ts'), 'utf8');
    const plugin = fs.readFileSync(path.join(root, 'plugins/sheep/src/field.tsx'), 'utf8');
    for (const key of ['w', 'h', 'e', 'l']) {
      const of = (text: string) => new RegExp(`(?:^|\\n)\\s*'?${key}'?:\\s*'(#[0-9a-fA-F]{3,8})'`).exec(text)?.[1];
      expect(of(core), `цвет ${key} у ядра`).toBe(of(plugin));
    }
  });
});
