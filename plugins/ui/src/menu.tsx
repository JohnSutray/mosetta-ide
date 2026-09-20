import { useIde, useT } from '@mosetta/ide-api/client';
import type { Windows } from './windows/windows.js';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface MenuItem {
  label: string;
  args?: Record<string, string | number>;
  danger?: boolean;
  run: () => void;
}

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
      if (mine || mount.idle(here)) came?.focus();
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
