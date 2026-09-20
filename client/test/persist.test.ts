import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Memory, type Scope } from '../src/state/persist.js';

/** The tab's memory is an instance owned by the root; the test sets up its own. */
const memory = new Memory();
const persisted = <T,>(key: string, initial: T, scope?: Scope) => memory.signal(key, initial, scope);
const recall = <T,>(key: string, fallback: T) => memory.recall(key, fallback);
const keep = (key: string, value: unknown, scope?: Scope) => memory.keep(key, value, scope);
const forget = (key: string, scope?: Scope) => memory.forget(key, scope);

/**
 * Two memories: the tab's and the machine's.
 *
 * The rule is simple to say and easy to break while editing: read the tab, then the
 * machine; write to both, except for what only makes sense here.
 */

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (at: number) => [...map.keys()][at] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

let tab: ReturnType<typeof fakeStore>;
let machine: ReturnType<typeof fakeStore>;

beforeEach(() => {
  tab = fakeStore();
  machine = fakeStore();
  Object.assign(globalThis, { sessionStorage: tab, localStorage: machine });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'sessionStorage');
  Reflect.deleteProperty(globalThis as object, 'localStorage');
});

describe('the tab memory and the machine memory', () => {
  it('a new tab grows out of the machine\'s last layout', () => {
    machine.map.set('web-ide.panel-widths', JSON.stringify({ tree: 300 }));
    expect(recall('panel-widths', {})).toEqual({ tree: 300 });
  });

  it('the tab\'s own layout beats the machine\'s', () => {
    machine.map.set('web-ide.panel-widths', JSON.stringify({ tree: 300 }));
    tab.map.set('web-ide.panel-widths', JSON.stringify({ tree: 180 }));
    expect(recall('panel-widths', {})).toEqual({ tree: 180 });
  });

  it('an ordinary write goes into both memories: this tab, and the seed for new ones', () => {
    keep('panel-widths', { tree: 220 });
    expect(JSON.parse(tab.map.get('web-ide.panel-widths')!)).toEqual({ tree: 220 });
    expect(JSON.parse(machine.map.get('web-ide.panel-widths')!)).toEqual({ tree: 220 });
  });

  it('what only makes sense here goes into the tab alone', () => {
    keep('file:/repo', 'src/main.ts', 'tab');
    expect(tab.map.has('web-ide.file:/repo')).toBe(true);
    expect(machine.map.has('web-ide.file:/repo')).toBe(false);
  });

  it('a spoiled value does not break the opening', () => {
    tab.map.set('web-ide.panel-widths', '{not json');
    expect(recall('panel-widths', { tree: 260 })).toEqual({ tree: 260 });
  });

  it('forgotten means forgotten in both', () => {
    keep('panel-widths', { tree: 220 });
    forget('panel-widths');
    expect(tab.map.size).toBe(0);
    expect(machine.map.size).toBe(0);
  });

  it('a signal remembers itself', () => {
    const open = persisted('panel.tree', true);
    expect(open.value).toBe(true);
    open.value = false;
    expect(JSON.parse(tab.map.get('web-ide.panel.tree')!)).toBe(false);
    expect(persisted('panel.tree', true).value).toBe(false);
  });

  it('with no storage at all we work without memory, but we work', () => {
    Reflect.deleteProperty(globalThis as object, 'sessionStorage');
    Reflect.deleteProperty(globalThis as object, 'localStorage');
    expect(() => keep('panel-widths', { tree: 1 })).not.toThrow();
    expect(recall('panel-widths', 'fallback')).toBe('fallback');
  });
});

describe('moving memory off the old package names', () => {
  it('an old package\'s key moves over, and a fresher one is not overwritten', () => {
    const mem = new Memory();
    mem.keep('@ide/plugin-tree/panel.open', true);
    mem.keep('@ide/ui/panel-widths', { tree: 340 });
    mem.keep('@mosetta/ide-plugin-ui/panel-widths', { tree: 500 });
    mem.migrate((key) => (key.startsWith('@ide/plugin-tree/') ? key.replace('@ide/', '@mosetta/ide-') : key.startsWith('@ide/ui/') ? key.replace('@ide/ui/', '@mosetta/ide-plugin-ui/') : null));
    expect(mem.recall('@mosetta/ide-plugin-tree/panel.open', false)).toBe(true);
    expect(mem.recall('@ide/plugin-tree/panel.open', 'none')).toBe('none');
    expect(mem.recall('@mosetta/ide-plugin-ui/panel-widths', {})).toEqual({ tree: 500 });
  });
});
