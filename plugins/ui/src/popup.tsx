import type { Size, Windows } from '@ide/windows';
import type { ComponentChildren } from 'preact';
import type { KeyContext } from '@ide/protocol';
import { useEffect, useRef } from 'preact/hooks';

export function Popup({ windows,
  id,
  keys,
  class: extra = '',
  size,
  min,
  over,
  layer,
  clear,
  full,
  anchor,
  onClose,
  onEscape,
  onMouseDown,
  children,
}: { windows: Windows;
  id: string;
  keys: KeyContext;
  class?: string;
  size: Size;
  min: Size;
  over?: string;
  layer?: boolean;
  clear?: boolean;
  full?: boolean;
  anchor?: { x: number; y: number };
  onClose: () => void;
  onEscape?: () => void;
  onMouseDown?: (event: MouseEvent) => void;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = full ? windows.geometry.viewport.value : windows.geometry.sizeOf(id, size);
  const at = anchor ? windows.geometry.fitAnchored(want, anchor, windows.geometry.viewport.value, min) : null;
  const current = at ? { w: at.w, h: at.h } : want;

  const closing = useRef(onEscape ?? onClose);
  closing.current = onEscape ?? onClose;
  useEffect(() => {
    windows.popups.enter({ id, close: () => closing.current(), over, layer, el: box.current });
    return () => windows.popups.leave(id);
  }, [id, over, layer]);

  useEffect(() => {
    if (box.current?.contains(document.activeElement)) return;
    box.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      class={`se-backdrop ${clear ? 'is-clear' : ''} ${full ? 'is-full' : ''}`}
      onMouseDown={onClose}
    >
      <div
        ref={box}
        class={`popup ${at ? 'is-anchored' : ''} ${full ? 'is-full' : ''} ${extra}`}
        data-keys={keys}
        tabIndex={-1}
        style={{
          width: `${current.w}px`,
          height: `${current.h}px`,
          ...(at ? { left: `${at.left}px`, top: `${at.top}px` } : {}),
        }}
        onMouseDown={(event) => {
          event.stopPropagation();
          onMouseDown?.(event as unknown as MouseEvent);
        }}
      >
        <span class="popup-exit">
          {!windows.host.catchesKeys(keys) && (
            <span class="popup-esc" title={windows.host.t('popup.escape')}>
              {windows.host.t('popup.esc')}
            </span>
          )}
          <span class="popup-close" title={windows.host.t('popup.close')} onClick={onClose}>
            ×
          </span>
        </span>

        {children}

        {!full && (
        <span
          class="popup-grip"
          title={windows.host.t('popup.resize')}
          onPointerDown={(event) => {
            event.preventDefault();
            const rect = box.current?.getBoundingClientRect();
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              w: rect?.width ?? current.w,
              h: rect?.height ?? current.h,
            };
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const started = drag.current;
            if (!started) return;
            windows.geometry.setPopupSize(
              id,
              {
                w: started.w + (event.clientX - started.x),
                h: started.h + (event.clientY - started.y),
              },
              min,
            );
          }}
          onPointerUp={(event) => {
            drag.current = null;
            (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
          }}
          onDblClick={() => windows.geometry.resetPopupSize(id)}
        />
        )}
      </div>
    </div>
  );
}
