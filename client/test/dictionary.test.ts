import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';

describe('словарь ядра', () => {
  it('не содержит ключей команд: команды принадлежат плагинам', () => {
    const ours = Object.keys(en as Record<string, string>).filter((key) => key.startsWith('command.'));
    expect(ours, `надписи команд в ядре: ${ours.join(', ')}`).toEqual([]);
  });

  it('не содержит пустых строк', () => {
    const empty = Object.entries(en as Record<string, string>)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty, `пустые надписи: ${empty.join(', ')}`).toEqual([]);
  });
});
