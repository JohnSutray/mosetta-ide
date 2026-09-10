import type { Windows } from '@ide/windows';
import { useEffect, useRef, useState } from 'preact/hooks';

export interface MenuItem {
  label: string;
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
      if (mine || here === document.body) came?.focus();
    };
  }, []);

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
      style={{ left: `${x}px`, top: `${y}px` }}
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
          {windows.host.t(item.label)}
        </button>
      ))}
    </div>
  );
}
