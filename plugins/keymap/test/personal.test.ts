import { describe, expect, it } from 'vitest';
import { inLayerOrder, USER_LAYER } from '@mosetta/ide-api/client';
import { PersonalKeymap, personalKeymap } from '../src/personal.js';
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

  it('снятые мной строки видны отдельно — иначе их не вернуть', () => {
    const gone = mine.drop(empty, factory, factory.bindings[0]!);
    expect(mine.removed(gone).map((one) => one.key)).toEqual(['meta+s']);
    expect(live(gone).bindings.some((one) => one.key === 'meta+s')).toBe(false);

    const back = mine.restore(gone, 'file.save');
    expect(mine.removed(back)).toEqual([]);
    expect(live(back)).toEqual(live(empty));
  });

  it('место — это клавиша, контекст и окружение', () => {
    const added = mine.add(empty, { command: 'tree.open', key: 'enter' });
    expect(mine.isMine(added, { command: 'tree.open', key: 'enter', when: 'tree' })).toBe(false);
    expect(live(added).bindings.filter((one) => one.key === 'enter')).toHaveLength(2);
  });
});

describe('стопка слоёв раскладки', () => {
  const FACTORY: Keymap = {
    version: 1,
    bindings: [{ command: 'search.everywhere', key: 'double:shift' }],
  };
  const MINE: Keymap = {
    version: 1,
    bindings: [{ command: 'search.everywhere', key: 'double:shift', remove: true }],
  };

  function fold(stack: Array<{ by: string; value: Keymap }>): Keymap {
    return inLayerOrder(stack).reduce<Keymap>(
      (all, one) => keymapRules.layer(all, keymapRules.validate(one.value)),
      { version: 1, bindings: [] },
    );
  }

  it('снятие действует, в каком бы порядке слои ни легли', () => {
    const factory = { by: '@mosetta/ide-plugin-keymap', value: FACTORY };
    const mine = { by: USER_LAYER, value: MINE };
    expect(fold([factory, mine]).bindings).toEqual([]);
    expect(fold([mine, factory]).bindings, 'мой слой лёг в реестр первым').toEqual([]);
  });

  it('снятая строка не считается живой — иначе она в двух списках сразу', () => {
    const live = fold([{ by: USER_LAYER, value: MINE }, { by: '@mosetta/ide-plugin-keymap', value: FACTORY }]);
    expect(personalKeymap.removed(MINE)).toHaveLength(1);
    expect(live.bindings.some((one) => one.command === 'search.everywhere')).toBe(false);
  });
});
