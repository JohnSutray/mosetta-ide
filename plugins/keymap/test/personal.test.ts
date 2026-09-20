import { describe, expect, it } from 'vitest';
import { inLayerOrder, USER_LAYER } from '@mosetta/ide-api/client';
import { PersonalKeymap, personalKeymap } from '../src/personal.js';
import { keymapRules } from '../src/rules.js';
import type { Keymap } from '../src/types.js';

/**
 * My edits to the layout: what goes into my `settings.json` when I move a key in the
 * settings window. The factory one neither disappears nor doubles along the way, and
 * "put it back as it was" puts it back exactly as it was.
 */
const mine = new PersonalKeymap();
const factory: Keymap = {
  version: 1,
  bindings: [
    { command: 'file.save', key: 'meta+s' },
    { command: 'tree.open', key: 'enter', when: 'tree' },
  ],
};
const empty: Keymap = { version: 1, bindings: [] };

/** The same way the plugin stacks the layers: the factory one, mine on top. */
function live(personal: Keymap): Keymap {
  return keymapRules.layer(keymapRules.validate(factory), keymapRules.validate(personal));
}

describe('my edits to the layout', () => {
  it('a reassignment gives up the old place and takes the new one', () => {
    const next = mine.rebind(empty, factory, factory.bindings[0]!, { command: 'file.save', key: 'meta+shift+s' });
    expect(next.bindings).toEqual([
      { command: 'file.save', key: 'meta+s', remove: true },
      { command: 'file.save', key: 'meta+shift+s' },
    ]);
    const all = live(next);
    expect(all.bindings.map((one) => one.key)).toEqual(['enter', 'meta+shift+s']);
  });

  it('changing the command in the same place needs no removal', () => {
    const next = mine.rebind(empty, factory, factory.bindings[0]!, { command: 'keys.show', key: 'meta+s' });
    expect(next.bindings).toEqual([{ command: 'keys.show', key: 'meta+s' }]);
    expect(live(next).bindings.find((one) => one.key === 'meta+s')?.command).toBe('keys.show');
  });

  it('bringing back the factory one takes away BOTH my rows — my own and the removal', () => {
    const changed = mine.rebind(empty, factory, factory.bindings[1]!, { command: 'tree.open', key: 'space', when: 'tree' });
    expect(changed.bindings).toHaveLength(2);
    const back = mine.restore(changed, 'tree.open');
    expect(back.bindings).toEqual([]);
    expect(live(back)).toEqual(live(empty));
  });

  it('taking away a factory key is a row with a removal', () => {
    const next = mine.drop(empty, factory, factory.bindings[0]!);
    expect(next.bindings).toEqual([{ command: 'file.save', key: 'meta+s', remove: true }]);
    expect(live(next).bindings.map((one) => one.key)).toEqual(['enter']);
  });

  it('taking away a key of my own is simply throwing it out', () => {
    const added = mine.add(empty, { command: 'keys.show', key: 'meta+f12' });
    expect(mine.drop(added, factory, { command: 'keys.show', key: 'meta+f12' }).bindings).toEqual([]);
  });

  it('the rows I have removed are visible separately — otherwise there is no bringing them back', () => {
    const gone = mine.drop(empty, factory, factory.bindings[0]!);
    expect(mine.removed(gone).map((one) => one.key)).toEqual(['meta+s']);
    expect(live(gone).bindings.some((one) => one.key === 'meta+s')).toBe(false);

    const back = mine.restore(gone, 'file.save');
    expect(mine.removed(back)).toEqual([]);
    expect(live(back)).toEqual(live(empty));
  });

  it('a place is the key, the context and the environment', () => {
    const added = mine.add(empty, { command: 'tree.open', key: 'enter' });
    expect(mine.isMine(added, { command: 'tree.open', key: 'enter', when: 'tree' })).toBe(false);
    expect(live(added).bindings.filter((one) => one.key === 'enter')).toHaveLength(2);
  });
});

describe('the stack of the layout\'s layers', () => {
  /**
   * My layer is obliged to lie ON TOP of the factory one, even if it got into the
   * registry earlier. The human caught this by eye: the row they had removed — "Shift
   * Shift — Search everywhere" — was both in the list of what was removed and alive in
   * the general list at once.
   */
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

  it('a removal applies whatever order the layers went in', () => {
    const factory = { by: '@mosetta/ide-plugin-keymap', value: FACTORY };
    const mine = { by: USER_LAYER, value: MINE };
    expect(fold([factory, mine]).bindings).toEqual([]);
    expect(fold([mine, factory]).bindings, 'my layer went into the registry first').toEqual([]);
  });

  it('a removed row does not count as alive — otherwise it is in two lists at once', () => {
    const live = fold([{ by: USER_LAYER, value: MINE }, { by: '@mosetta/ide-plugin-keymap', value: FACTORY }]);
    expect(personalKeymap.removed(MINE)).toHaveLength(1);
    expect(live.bindings.some((one) => one.command === 'search.everywhere')).toBe(false);
  });
});
