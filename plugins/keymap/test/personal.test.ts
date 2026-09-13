import { describe, expect, it } from 'vitest';
import { PersonalKeymap } from '../src/personal.js';
import { keymapRules } from '../src/rules.js';
import type { Keymap } from '../src/types.js';

const mine = new PersonalKeymap();
const factory: Keymap = {
  version: 1,
  bindings: [
    { command: 'file.save', key: 'meta+s' },
    { command: 'tree.open', key: 'enter', when: 'tree' },
  ],
};
const empty: Keymap = { version: 1, bindings: [] };

function live(personal: Keymap): Keymap {
  return keymapRules.layer(keymapRules.validate(factory), keymapRules.validate(personal));
}

describe('мои правки раскладки', () => {
  it('переназначение снимает старое место и занимает новое', () => {
    const next = mine.rebind(empty, factory, factory.bindings[0]!, { command: 'file.save', key: 'meta+shift+s' });
    expect(next.bindings).toEqual([
      { command: 'file.save', key: 'meta+s', remove: true },
      { command: 'file.save', key: 'meta+shift+s' },
    ]);
    const all = live(next);
    expect(all.bindings.map((one) => one.key)).toEqual(['enter', 'meta+shift+s']);
  });

  it('смена команды на том же месте снятия не требует', () => {
    const next = mine.rebind(empty, factory, factory.bindings[0]!, { command: 'keys.show', key: 'meta+s' });
    expect(next.bindings).toEqual([{ command: 'keys.show', key: 'meta+s' }]);
    expect(live(next).bindings.find((one) => one.key === 'meta+s')?.command).toBe('keys.show');
  });

  it('вернуть заводское убирает ОБЕ мои строки — и свою, и снятие', () => {
    const changed = mine.rebind(empty, factory, factory.bindings[1]!, { command: 'tree.open', key: 'space', when: 'tree' });
    expect(changed.bindings).toHaveLength(2);
    const back = mine.restore(changed, 'tree.open');
    expect(back.bindings).toEqual([]);
    expect(live(back)).toEqual(live(empty));
  });

  it('убрать заводскую клавишу — это строка со снятием', () => {
    const next = mine.drop(empty, factory, factory.bindings[0]!);
    expect(next.bindings).toEqual([{ command: 'file.save', key: 'meta+s', remove: true }]);
    expect(live(next).bindings.map((one) => one.key)).toEqual(['enter']);
  });

  it('убрать свою клавишу — просто выбросить её', () => {
    const added = mine.add(empty, { command: 'keys.show', key: 'meta+f12' });
    expect(mine.drop(added, factory, { command: 'keys.show', key: 'meta+f12' }).bindings).toEqual([]);
  });

  it('место — это клавиша, контекст и окружение', () => {
    const added = mine.add(empty, { command: 'tree.open', key: 'enter' });
    expect(mine.isMine(added, { command: 'tree.open', key: 'enter', when: 'tree' })).toBe(false);
    expect(live(added).bindings.filter((one) => one.key === 'enter')).toHaveLength(2);
  });
});
