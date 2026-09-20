import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Popups } from '../src/windows/popups.js';

const popups = new Popups();

/**
 * A popup closed means the human returned to where they came from.
 *
 * The rule is end-to-end, which is why it lives in the frame rather than in every
 * popup. Checking it by eye is expensive: one would have to open every popup, close it
 * three ways and see where the focus went. Here that is six lines.
 */

interface FakeEl {
  isConnected: boolean;
  focused: number;
  focus(): void;
  contains(other: unknown): boolean;
  children: FakeEl[];
}

/**
 * A fake element instead of a real DOM: the focus rule is checked without a browser.
 * The cast is used where it goes into core code — which is more honest than erecting
 * three hundred properties of an HTMLElement for the sake of four that are used.
 */
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

/** Wait for a microtask: the decision to return is taken in exactly that one. */
const settle = () => new Promise<void>((done) => queueMicrotask(() => done()));

beforeEach(() => {
  popups.stack.value = [];
  setActive(asEl(body));
});

afterEach(() => {
  Reflect.deleteProperty(globalThis as object, 'document');
});

describe('returning the focus from a popup', () => {
  it('the focus goes back where it was', async () => {
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

  it('the mouse wins: a click on the tree leaves the focus there', async () => {
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

  it('a popup above a popup gives the focus back to the lower one', async () => {
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

  it('an element that has vanished is not given the focus back', async () => {
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
