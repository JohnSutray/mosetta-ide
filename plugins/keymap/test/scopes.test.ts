import { describe, expect, it } from 'vitest';
import { Scopes } from '../src/scopes.js';
import { FACTORY_KEYMAP } from '../src/keymap.js';

const scopes = new Scopes();

describe('окружения строки раскладки', () => {
  it('пусто в файле — значит все шесть клеток', () => {
    expect(scopes.cells(undefined)).toEqual({ browser: ['mac', 'win', 'linux'], electron: ['mac', 'win', 'linux'] });
    expect(scopes.where(scopes.cells(undefined)), 'и обратно — пустотой').toBeUndefined();
  });

  it('весь хост пишется одним словом, часть — парами', () => {
    expect(scopes.cells(['browser'])).toMatchObject({ browser: ['mac', 'win', 'linux'], electron: [] });
    expect(scopes.where({ browser: ['mac', 'win', 'linux'], electron: ['win'] })).toEqual(['browser', 'electron:win']);
  });

  it('туда и обратно — то же самое', () => {
    const all = [
      ['browser:mac', 'electron:mac'],
      ['browser:win', 'browser:linux', 'electron:win', 'electron:linux'],
      ['electron'],
      ['browser:mac'],
    ] as const;
    for (const where of all) {
      expect(scopes.where(scopes.cells(where)), where.join(', ')).toEqual([...where]);
    }
  });

  it('ни одной клетки — строка мертва, и это видно', () => {
    expect(scopes.empty({ browser: [], electron: [] })).toBe(true);
    expect(scopes.empty({ browser: ['mac'], electron: [] })).toBe(false);
  });

  it('короткая сводка: весь хост без букв, часть — с буквами, «везде» — пусто', () => {
    expect(scopes.summary(undefined)).toEqual([]);
    expect(scopes.summary(['browser'])).toEqual([{ host: 'browser', oses: ['mac', 'win', 'linux'], all: true }]);
    expect(scopes.summary(['browser:mac', 'electron:mac'])).toEqual([
      { host: 'browser', oses: ['mac'], all: false },
      { host: 'electron', oses: ['mac'], all: false },
    ]);
  });

  it('вся поставка сворачивается обратно в себя', () => {
    for (const binding of FACTORY_KEYMAP.bindings) {
      expect(scopes.where(scopes.cells(binding.where)), binding.key).toEqual(binding.where);
    }
  });
});
