import { describe, expect, it } from 'vitest';
import { COMMAND_IDS } from '@ide/protocol';
import en from '../src/i18n/en.json';

describe('словарь ядра', () => {
  it('у каждой команды ядра есть английское имя', () => {
    const dictionary = en as Record<string, string>;
    const missing = COMMAND_IDS.filter((id) => dictionary[`command.${id}`] === undefined);
    expect(missing, `нет command.* в en.json: ${missing.join(', ')}`).toEqual([]);
  });

  it('не содержит пустых строк', () => {
    const empty = Object.entries(en as Record<string, string>)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empty, `пустые надписи: ${empty.join(', ')}`).toEqual([]);
  });
});
