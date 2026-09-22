import { InputMechanics } from '@mosetta/ide-plugin-code';
import { reserved } from '../src/reserved.js';
import { describe, expect, it } from 'vitest';
import { keyRules } from '../src/dispatcher.js';
import { keyHost } from '../src/host.js';
import { WORLDS, inWorld, keymap } from './keymap-shared.js';

const inputMechanics = new InputMechanics();
keyRules.useMechanics(inputMechanics.keys(keyHost.isMac));

/**
 * A rule that runs through the whole layout: an input field owns the keys text is
 * edited with. It is checked here rather than by eye, because a breach of this rule
 * looks accidental: Backspace in the project path field called "delete" from the tree
 * and offered to demolish the project root.
 */
function press(key: string, target: unknown, mods: Record<string, boolean> = {}) {
  return {
    key,
    code: '',
    target,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  } as unknown as KeyboardEvent;
}

function stroke(code: string, key: string, mods: Record<string, boolean> = {}) {
  return {
    code,
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  } as unknown as KeyboardEvent;
}

const INPUT = { tagName: 'INPUT', isContentEditable: false, value: 'x' };
const AREA = { tagName: 'TEXTAREA', isContentEditable: false, value: 'x' };
const EMPTY = { tagName: 'INPUT', isContentEditable: false, value: '' };
const EDITOR = { tagName: 'DIV', isContentEditable: true };
const ROW = { tagName: 'DIV', isContentEditable: false };

describe('the layout and input fields', () => {
  it('the erasing keys in a field belong to the field', () => {
    expect(keyRules.typedIntoField(press('Backspace', INPUT))).toBe(true);
    expect(keyRules.typedIntoField(press('Delete', AREA))).toBe(true);
    expect(keyRules.typedIntoField(press('x', EDITOR))).toBe(true);
  });

  it('outside a field they go to the layout', () => {
    expect(keyRules.typedIntoField(press('Backspace', ROW))).toBe(false);
    expect(keyRules.typedIntoField(press('Backspace', null))).toBe(false);
  });

  it('the editable context stands between one\'s own and the global one, and is given to a field alone', () => {
    const bindings = [
      { command: 'field.native', key: 'meta+z', when: 'editable' as const },
      { command: 'edit.undo', key: 'meta+z' },
      { command: 'find.next', key: 'enter', when: 'find' as const },
    ];
    expect(keyRules.pick(bindings, 'find', 'meta+z', true)?.command).toBe('field.native');
    expect(keyRules.pick(bindings, 'tree', 'meta+z', false)?.command).toBe('edit.undo');
    expect(keyRules.pick(bindings, 'find', 'enter', true)?.command).toBe('find.next');
    expect(keyRules.inPlainField(INPUT as never)).toBe(true);
    expect(keyRules.inPlainField(EDITOR as never)).toBe(false);
    expect(keyRules.inPlainField(ROW as never)).toBe(false);
  });

  it('a chain of contexts: one\'s own first, what is missing from the next one, then the global one', () => {
    const bindings = [
      { command: 'completion.accept', key: 'enter', when: 'completion' as const },
      { command: 'edit.undo', key: 'meta+z', when: 'editor' as const },
      { command: 'search.everywhere', key: 'meta+o' },
    ];
    const chain = ['completion', 'editor'] as const;
    expect(keyRules.pick(bindings, chain, 'enter', false)?.command).toBe('completion.accept');
    expect(keyRules.pick(bindings, chain, 'meta+z', false)?.command).toBe('edit.undo');
    expect(keyRules.pick(bindings, chain, 'meta+o', false)?.command).toBe('search.everywhere');
    expect(keyRules.pick(bindings, 'editor', 'enter', false)).toBeUndefined();
  });

  it('in an EMPTY field there is nothing to erase — Backspace goes to the layout', () => {
    expect(keyRules.typedIntoField(press('Backspace', EMPTY))).toBe(false);
    expect(keyRules.typedIntoField(press('Delete', EMPTY))).toBe(false);
    expect(keyRules.typedIntoField(press('x', EMPTY))).toBe(true);
  });

  it('a chord with a modifier is not text', () => {
    expect(keyRules.typedIntoField(press('s', INPUT, { metaKey: true }))).toBe(false);
    expect(keyRules.typedIntoField(press('Backspace', INPUT, { altKey: true }))).toBe(false);
  });

  it('Enter, Escape and the arrows pass through: lists with a search rest on them', () => {
    expect(keyRules.typedIntoField(press('Enter', INPUT))).toBe(false);
    expect(keyRules.typedIntoField(press('Escape', INPUT))).toBe(false);
    expect(keyRules.typedIntoField(press('ArrowDown', INPUT))).toBe(false);
  });
});

/**
 * A press string is PHYSICAL, and one for every environment. There are no roles like
 * `mod` in it: the event and the layout speak one language.
 */
describe('the press string', () => {
  it('the modifiers are named physically and always in one order', () => {
    expect(keyRules.eventToKey(stroke('KeyS', 's', { metaKey: true }))).toBe('meta+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { altKey: true }))).toBe('alt+s');
    expect(
      keyRules.eventToKey(
        stroke('KeyK', 'k', { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true }),
      ),
    ).toBe('meta+control+alt+shift+k');
  });

  it('there are no roles in an event\'s string', () => {
    const cases: Array<Record<string, boolean>> = [
      { metaKey: true },
      { ctrlKey: true },
      { altKey: true },
    ];
    for (const mods of cases) {
      expect(keyRules.eventToKey(stroke('Digit1', '1', mods))).not.toMatch(/\b(mod|clip|cmd|ctrl)\b/);
    }
  });
});

/**
 * A key is called by its CELL rather than by the character printed on it. All three
 * breakages below happened live, and looked alike — "the key just does not work".
 */
describe('a key from the cell rather than from the character', () => {
  it('Cyrillic does not cancel saving', () => {
    expect(keyRules.eventToKey(stroke('KeyS', 'ы', { ctrlKey: true }))).toBe('control+s');
    expect(keyRules.eventToKey(stroke('KeyS', 's', { ctrlKey: true }))).toBe('control+s');
  });

  it('Option arrives as an assembled character while the cell stays the same', () => {
    expect(keyRules.eventToKey(stroke('Digit2', '™', { altKey: true }))).toBe('alt+2');
    expect(keyRules.eventToKey(stroke('Digit3', '£', { altKey: true }))).toBe('alt+3');
  });

  it('the key under Escape is one and the same in both layouts', () => {
    expect(keyRules.eventToKey(stroke('Backquote', '`'))).toBe('backquote');
    expect(keyRules.eventToKey(stroke('Backquote', 'ё'))).toBe('backquote');
  });

  it('the names of the keys are taken from the code as they are', () => {
    expect(keyRules.eventToKey(stroke('ArrowDown', 'ArrowDown'))).toBe('arrowdown');
    expect(keyRules.eventToKey(stroke('Escape', 'Escape'))).toBe('escape');
    expect(keyRules.eventToKey(stroke('Space', ' '))).toBe('space');
    expect(keyRules.eventToKey(stroke('Slash', '.'))).toBe('slash');
  });

  it('a bare modifier does not count as a key', () => {
    expect(keyRules.eventToKey(stroke('ShiftLeft', 'Shift', { shiftKey: true }))).toBe(null);
  });

  it('without a code there is a fallback path by character', () => {
    expect(keyRules.eventToKey(stroke('', 'ё'))).toBe('backquote');
    expect(keyRules.eventToKey(stroke('', 'k', { ctrlKey: true }))).toBe('control+k');
  });
});

/**
 * Which keys the editor complains about out loud. The rule is shared with swallowing:
 * we complain about exactly what we took. Eat a press and do nothing with it — the
 * silence looks like a breakage.
 */
describe('the complaint about a key with no command', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+x`, `${keyHost.primary}+v`]);
  const once = { repeat: false, clip };

  it('a chord with no command — we speak up', () => {
    expect(keyRules.complains(`${keyHost.primary}+j`, once)).toBe(true);
    expect(keyRules.complains(`${keyHost.primary}+shift+j`, once)).toBe(true);
  });

  it('another modifier of ours speaks up too: we took that one as well', () => {
    const other = keyHost.primary === 'control' ? 'meta' : 'control';
    expect(keyRules.complains(`${other}+j`, once)).toBe(true);
  });

  it('Shift on its own makes no chord', () => {
    expect(keyRules.complains('shift+arrowleft', once)).toBe(false);
    expect(keyRules.complains('shift+k', once)).toBe(false);
  });

  it('a bare key is input rather than a miss', () => {
    expect(keyRules.complains('k', once)).toBe(false);
    expect(keyRules.complains('escape', once)).toBe(false);
  });

  it('the editor\'s input mechanics keep quiet', () => {
    for (const key of inputMechanics.keys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(keyRules.complains(key, once), key).toBe(false);
    }
  });

  it('a held key does not mutter', () => {
    expect(keyRules.complains(`${keyHost.primary}+j`, { repeat: true, clip })).toBe(false);
  });

  it('the clipboard keeps quiet even when it is on the main modifier', () => {
    expect(keyRules.complains(`${keyHost.primary}+c`, once)).toBe(false);
  });
});

/**
 * Other people's consequences of our chord are swallowed: otherwise the browser adds
 * its own to our action — printing, saving the page, going back through the tab's
 * history.
 */
describe('catching other people\'s effects', () => {
  const clip = new Set([`${keyHost.primary}+c`, `${keyHost.primary}+v`]);

  it('a chord with the main modifier is swallowed even when it is not assigned', () => {
    expect(keyRules.swallows(`${keyHost.primary}+s`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+p`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+j`, clip)).toBe(true);
  });

  it('any modifier of ours is swallowed rather than only the main one', () => {
    for (const mod of ['meta', 'control', 'alt']) {
      expect(keyRules.swallows(`${mod}+j`, clip), mod).toBe(true);
    }
  });

  it('Shift on its own is no chord: a selection stays a selection', () => {
    expect(keyRules.swallows('shift+arrowleft', clip)).toBe(false);
    expect(keyRules.swallows('shift+home', clip)).toBe(false);
  });

  it('the clipboard and the input mechanics are not swallowed', () => {
    expect(keyRules.swallows(`${keyHost.primary}+c`, clip)).toBe(false);
    for (const key of inputMechanics.keys(keyHost.isMac)) {
      if (!key.split('+').includes(keyHost.primary)) continue;
      expect(keyRules.swallows(key, clip), key).toBe(false);
    }
  });

  it('a bare key is input rather than a chord', () => {
    expect(keyRules.swallows('enter', clip)).toBe(false);
    expect(keyRules.swallows('k', clip)).toBe(false);
  });

  it('what is softly taken is swallowed everywhere, past every other rule', () => {
    const key = [...inputMechanics.keys(keyHost.isMac)][0]!;
    expect(keyRules.swallows(key, clip)).toBe(false);
    expect(keyRules.swallows(key, clip, { soft: new Set([key]) })).toBe(true);
  });

  it('what is left to the browser is not swallowed: it is the way out', () => {
    const left = new Set([`${keyHost.primary}+r`]);
    expect(keyRules.swallows(`${keyHost.primary}+r`, clip)).toBe(true);
    expect(keyRules.swallows(`${keyHost.primary}+r`, clip, { left })).toBe(false);
  });
});

/** A double press of a modifier: a rhythm rather than a chord. */
describe('double modifiers', () => {
  it('the layout and the user name the key alike', () => {
    expect(keyHost.humanize('double:meta')).toBe(keyHost.isMac ? 'Cmd Cmd' : 'Win Win');
    expect(keyHost.humanize('double:control')).toBe('Control Control');
    expect(keyHost.humanize('double:alt')).toBe(keyHost.isMac ? 'Option Option' : 'Alt Alt');
    expect(keyHost.humanize('double:shift')).toBe('Shift Shift');
  });

  it('all four modifiers are taken, and taken by different things', () => {
    const doubles = keymap().bindings.filter((b) => b.key.startsWith('double:'));
    expect(doubles.map((b) => b.key).sort()).toEqual([
      'double:alt',
      'double:control',
      'double:meta',
      'double:shift',
    ]);
    expect(new Set(doubles.map((b) => b.command)).size).toBe(doubles.length);
  });

  it('a double tap lives where the bare tap is free', () => {
    for (const world of WORLDS) {
      const taken = new Set(reserved.hardIn([world.scope]).map((item) => item.key));
      const doubles = inWorld(keymap().bindings, world).filter((b) => b.key.startsWith('double:'));
      for (const binding of doubles) {
        expect(taken.has(binding.key.slice(7)), `${world.scope}: ${binding.key}`).toBe(false);
      }
      const keys = doubles.map((b) => b.key);
      expect(keys, world.scope).toContain('double:shift');
      expect(keys, world.scope).toContain('double:control');
    }
  });
});
