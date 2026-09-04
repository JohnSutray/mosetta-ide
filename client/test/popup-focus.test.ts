import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { popups } from '@ide/windows';

interface FakeEl {
  isConnected: boolean;
  focused: number;
  focus(): void;
  contains(other: unknown): boolean;
  children: FakeEl[];
}

function asEl(fake: FakeEl): HTMLElement {
  return fake as unknown as HTMLElement;
}

function el(children: FakeEl[] = []): FakeEl {
  const node: FakeEl = {
    isConnected: true,
    focused: 0,
    focus() {
      node.focused += 1;
      setActive(asEl(node));
    },
    contains: (other: unknown) => other === node || children.includes(other as FakeEl),
    children,
  };
  return node;
}

const body = el();

function setActive(node: FakeEl | HTMLElement | null): void {
  (globalThis as { document?: unknown }).document = { activeElement: node ?? body, body };
}

const settle = () => new Promise<void>((done) => queueMicrotask(() => done()));

beforeEach(() => {
  popups.stack.value = [];
  setActive(asEl(body));
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'document');
});

describe('возврат фокуса из попапа', () => {
  it('фокус возвращается туда, где был', async () => {
    const editor = el();
    setActive(asEl(editor));

    const popup = el();
    popups.enter({ id: 'search', close: () => {}, el: asEl(popup) });
    popup.focus();

    popup.isConnected = false;
    popups.leave('search');
    await settle();
    expect(editor.focused).toBe(1);
  });

  it('мышь сильнее: щёлкнули по дереву — фокус остаётся там', async () => {
    const editor = el();
    setActive(asEl(editor));
    const popup = el();
    popups.enter({ id: 'search', close: () => {}, el: asEl(popup) });
    popup.focus();

    const tree = el();
    tree.focus();
    popup.isConnected = false;
    popups.leave('search');
    await settle();
    expect(editor.focused).toBe(0);
    expect(tree.focused).toBe(1);
  });

  it('попап над попапом возвращает фокус нижнему', async () => {
    const editor = el();
    setActive(asEl(editor));
    const branches = el();
    popups.enter({ id: 'branches', close: () => {}, el: asEl(branches) });
    branches.focus();

    const push = el();
    popups.enter({ id: 'push', close: () => {}, over: 'branches', el: asEl(push) });
    push.focus();

    push.isConnected = false;
    popups.leave('push');
    await settle();
    expect(branches.focused).toBe(2);
    expect(editor.focused).toBe(0);

    branches.isConnected = false;
    popups.leave('branches');
    await settle();
    expect(editor.focused).toBe(1);
  });

  it('исчезнувшему элементу фокус не возвращают', async () => {
    const gone = el();
    setActive(asEl(gone));
    const popup = el();
    popups.enter({ id: 'search', close: () => {}, el: asEl(popup) });
    popup.focus();

    gone.isConnected = false;
    popup.isConnected = false;
    popups.leave('search');
    await settle();
    expect(gone.focused).toBe(0);
  });
});
