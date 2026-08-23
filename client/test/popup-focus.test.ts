import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { enter, leave, stack } from '../src/state/popups.js';

interface FakeEl {
  isConnected: boolean;
  focused: number;
  focus(): void;
  contains(other: unknown): boolean;
  children: FakeEl[];
}

function el(children: FakeEl[] = []): FakeEl {
  const node: FakeEl = {
    isConnected: true,
    focused: 0,
    focus() {
      node.focused += 1;
      setActive(node);
    },
    contains: (other: unknown) => other === node || children.includes(other as FakeEl),
    children,
  };
  return node;
}

const body = el();

function setActive(node: FakeEl | null): void {
  (globalThis as { document?: unknown }).document = { activeElement: node ?? body, body };
}

const settle = () => new Promise<void>((done) => queueMicrotask(() => done()));

beforeEach(() => {
  stack.value = [];
  setActive(body);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'document');
});

describe('возврат фокуса из попапа', () => {
  it('фокус возвращается туда, где был', async () => {
    const editor = el();
    setActive(editor);

    const popup = el();
    enter({ id: 'search', close: () => {}, el: popup });
    popup.focus();

    popup.isConnected = false;
    leave('search');
    await settle();
    expect(editor.focused).toBe(1);
  });

  it('мышь сильнее: щёлкнули по дереву — фокус остаётся там', async () => {
    const editor = el();
    setActive(editor);
    const popup = el();
    enter({ id: 'search', close: () => {}, el: popup });
    popup.focus();

    const tree = el();
    tree.focus();
    popup.isConnected = false;
    leave('search');
    await settle();
    expect(editor.focused).toBe(0);
    expect(tree.focused).toBe(1);
  });

  it('попап над попапом возвращает фокус нижнему', async () => {
    const editor = el();
    setActive(editor);
    const branches = el();
    enter({ id: 'branches', close: () => {}, el: branches });
    branches.focus();

    const push = el();
    enter({ id: 'push', close: () => {}, over: 'branches', el: push });
    push.focus();

    push.isConnected = false;
    leave('push');
    await settle();
    expect(branches.focused).toBe(2);
    expect(editor.focused).toBe(0);

    branches.isConnected = false;
    leave('branches');
    await settle();
    expect(editor.focused).toBe(1);
  });

  it('исчезнувшему элементу фокус не возвращают', async () => {
    const gone = el();
    setActive(gone);
    const popup = el();
    enter({ id: 'search', close: () => {}, el: popup });
    popup.focus();

    gone.isConnected = false;
    popup.isConnected = false;
    leave('search');
    await settle();
    expect(gone.focused).toBe(0);
  });
});
