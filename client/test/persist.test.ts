import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Memory, type Scope } from '../src/state/persist.js';

const memory = new Memory();
const persisted = <T,>(key: string, initial: T, scope?: Scope) => memory.signal(key, initial, scope);
const recall = <T,>(key: string, fallback: T) => memory.recall(key, fallback);
const keep = (key: string, value: unknown, scope?: Scope) => memory.keep(key, value, scope);
const forget = (key: string, scope?: Scope) => memory.forget(key, scope);

function fakeStore() {
  const map = new Map<string, string>();
  return {
    map,
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

describe('память вкладки и память машины', () => {
  it('новая вкладка прорастает из последней раскладки машины', () => {
    machine.map.set('web-ide.panel-widths', JSON.stringify({ tree: 300 }));
    expect(recall('panel-widths', {})).toEqual({ tree: 300 });
  });

  it('своя раскладка вкладки сильнее машинной', () => {
    machine.map.set('web-ide.panel-widths', JSON.stringify({ tree: 300 }));
    tab.map.set('web-ide.panel-widths', JSON.stringify({ tree: 180 }));
    expect(recall('panel-widths', {})).toEqual({ tree: 180 });
  });

  it('обычная запись идёт в обе памяти: вкладке и на развод новых', () => {
    keep('panel-widths', { tree: 220 });
    expect(JSON.parse(tab.map.get('web-ide.panel-widths')!)).toEqual({ tree: 220 });
    expect(JSON.parse(machine.map.get('web-ide.panel-widths')!)).toEqual({ tree: 220 });
  });

  it('что осмысленно только здесь — только во вкладке', () => {
    keep('file:/repo', 'src/main.ts', 'tab');
    expect(tab.map.has('web-ide.file:/repo')).toBe(true);
    expect(machine.map.has('web-ide.file:/repo')).toBe(false);
  });

  it('испорченное значение не ломает открытие', () => {
    tab.map.set('web-ide.panel-widths', '{это не json');
    expect(recall('panel-widths', { tree: 260 })).toEqual({ tree: 260 });
  });

  it('забыли — значит забыли в обеих', () => {
    keep('panel-widths', { tree: 220 });
    forget('panel-widths');
    expect(tab.map.size).toBe(0);
    expect(machine.map.size).toBe(0);
  });

  it('сигнал помнит себя сам', () => {
    const open = persisted('panel.tree', true);
    expect(open.value).toBe(true);
    open.value = false;
    expect(JSON.parse(tab.map.get('web-ide.panel.tree')!)).toBe(false);
    expect(persisted('panel.tree', true).value).toBe(false);
  });

  it('без хранилищ вообще — работаем без памяти, но работаем', () => {
    Reflect.deleteProperty(globalThis as object, 'sessionStorage');
    Reflect.deleteProperty(globalThis as object, 'localStorage');
    expect(() => keep('panel-widths', { tree: 1 })).not.toThrow();
    expect(recall('panel-widths', 'дефолт')).toBe('дефолт');
  });
});
