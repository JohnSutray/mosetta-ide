import { describe, expect, it } from 'vitest';
import { Scopes } from '../src/scopes.js';
import { FACTORY_KEYMAP } from '../src/keymap.js';

/**
 * A row's environments as a "where × on what" grid. Folding it wrongly means quietly
 * changing the row's meaning, so both directions are checked, and on the real shipment
 * too.
 */
const scopes = new Scopes();

describe('a layout row\'s environments', () => {
  it('empty in the file means all six cells', () => {
    expect(scopes.cells(undefined)).toEqual({ browser: ['mac', 'win', 'linux'], electron: ['mac', 'win', 'linux'] });
    expect(scopes.where(scopes.cells(undefined)), 'and back again — as emptiness').toBeUndefined();
  });

  it('a whole host is written in one word, a part of one in pairs', () => {
    expect(scopes.cells(['browser'])).toMatchObject({ browser: ['mac', 'win', 'linux'], electron: [] });
    expect(scopes.where({ browser: ['mac', 'win', 'linux'], electron: ['win'] })).toEqual(['browser', 'electron:win']);
  });

  it('there and back is the same thing', () => {
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

  it('not a single cell — the row is dead, and that is visible', () => {
    expect(scopes.empty({ browser: [], electron: [] })).toBe(true);
    expect(scopes.empty({ browser: ['mac'], electron: [] })).toBe(false);
  });

  it('a short summary: a whole host without letters, a part of one with letters, "everywhere" empty', () => {
    expect(scopes.summary(undefined)).toEqual([]);
    expect(scopes.summary(['browser'])).toEqual([{ host: 'browser', oses: ['mac', 'win', 'linux'], all: true }]);
    expect(scopes.summary(['browser:mac', 'electron:mac'])).toEqual([
      { host: 'browser', oses: ['mac'], all: false },
      { host: 'electron', oses: ['mac'], all: false },
    ]);
  });

  it('the whole shipment folds back into itself', () => {
    for (const binding of FACTORY_KEYMAP.bindings) {
      expect(scopes.where(scopes.cells(binding.where)), binding.key).toEqual(binding.where);
    }
  });
});
