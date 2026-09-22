import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RootMount } from '../src/state/mount.js';

/**
 * `reveal` scrolls only the box that scrolls the element, and an element wider than that
 * box is aligned to its start: the tree's rows carry a long root path, and "as little as
 * it takes" once scrolled the names out of sight.
 */
type Box = { top: number; left: number; width: number; height: number };

function element(box: Box, parent: unknown, extra: Record<string, unknown> = {}) {
  return {
    parentElement: parent,
    getBoundingClientRect: () => ({ ...box, right: box.left + box.width, bottom: box.top + box.height }),
    ...extra,
  };
}

function scroller(box: Box, content: { width: number; height: number }) {
  const self = element(box, null, {
    clientTop: 0,
    clientLeft: 0,
    clientWidth: box.width,
    clientHeight: box.height,
    scrollWidth: content.width,
    scrollHeight: content.height,
    scrollTop: 0,
    scrollLeft: 0,
    overflow: 'auto',
  });
  return self as typeof self & { scrollTop: number; scrollLeft: number };
}

const saved = (globalThis as { getComputedStyle?: unknown }).getComputedStyle;

beforeEach(() => {
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = (el: { overflow?: string }) => ({
    overflowX: el.overflow ?? 'visible',
    overflowY: el.overflow ?? 'visible',
  });
});

afterEach(() => {
  (globalThis as { getComputedStyle?: unknown }).getComputedStyle = saved;
});

function mount(): RootMount {
  const root = {
    style: { setProperty() {} },
    classList: { add() {} },
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }),
  };
  return new RootMount(root as unknown as HTMLElement, { page: false });
}

describe('reveal', () => {
  it('keeps a row wider than its column aligned to the left', () => {
    const column = scroller({ top: 0, left: 0, width: 200, height: 300 }, { width: 600, height: 900 });
    const row = element({ top: 40, left: 0, width: 600, height: 20 }, column);
    mount().reveal(row as unknown as Element);
    expect(column.scrollLeft).toBe(0);
    expect(column.scrollTop).toBe(0);
  });

  it('scrolls down just enough to show a row below the fold', () => {
    const column = scroller({ top: 0, left: 0, width: 200, height: 300 }, { width: 200, height: 900 });
    const row = element({ top: 310, left: 0, width: 180, height: 20 }, column);
    mount().reveal(row as unknown as Element);
    expect(column.scrollTop).toBe(30);
  });
});
