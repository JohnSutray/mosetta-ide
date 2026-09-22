import { useIde, useT } from '@mosetta/ide-api/client';
import type { Windows } from './windows/windows.js';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface MenuItem {
  /** A dictionary key: labels are data. */
  label: string;
  /**
   * Substitutions in a label: "move to {name}" is one item with a parameter rather than
   * ten dictionary keys for ten changelists.
   */
  args?: Record<string, string | number>;
  danger?: boolean;
  run: () => void;
}

/**
 * A dropdown menu — one for everyone.
 *
 * Its main property is not its look but that it TAKES CONTROL. While a menu is open,
 * the arrows and Enter belong to it rather than to the list beneath: a branch's action
 * menu used to hang over the branch list while the arrows went on scrolling the list —
 * that is, choosing by eye in one place and by key in another.
 *
 * The mechanics are the same as everything else's: the menu takes the OS focus and
 * names its own surface, so the "capture" comes about by itself rather than from a list
 * of exceptions. On leaving, it gives the focus back to whoever it took it from.
 */
export function Menu({ windows,
  x,
  y,
  items,
  onClose,
  class: extra = '',
}: { windows: Windows;
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  class?: string;
}) {
  const t = useT();
  const mount = useIde().mount;
  const spot = mount.local(x, y);
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  useEffect(() => {
    const came = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    windows.popups.enter({ id: 'menu', close: onClose, layer: true });
    return () => {
      windows.popups.leave('menu');
      const here = document.activeElement;
      const mine = here === box.current || (here !== null && box.current?.contains(here));
      if (mine || mount.idle(here)) came?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(
    () =>
      mount.listen('mousedown', (event) => {
        if (!box.current?.contains(event.target as Node)) onClose();
      }),
    [onClose],
  );

  useEffect(() => {
    const total = items.length;
    windows.activeMenu.value = {
      next: () => setAt((was) => (total ? (was + 1) % total : 0)),
      prev: () => setAt((was) => (total ? (was - 1 + total) % total : 0)),
      accept: () => {
        const item = items[at];
        if (!item) return;
        onClose();
        item.run();
      },
    };
    return () => {
      windows.activeMenu.value = null;
    };
  }, [items, at, onClose]);

  return (
    <div
      ref={box}
      class={`branch-menu ${extra}`}
      data-keys="menu"
      tabIndex={-1}
      style={{ left: `${spot.x}px`, top: `${spot.y}px` }}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          class={`branch-action ${item.danger ? 'is-danger' : ''} ${
            index === at ? 'is-current' : ''
          }`}
          onMouseMove={index === at ? undefined : () => setAt(index)}
          onClick={() => {
            onClose();
            item.run();
          }}
        >
          {t(item.label, item.args)}
        </button>
      ))}
    </div>
  );
}
