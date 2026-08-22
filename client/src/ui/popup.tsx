import type { ComponentChildren } from 'preact';
import type { KeyContext } from '@ide/protocol';
import { useEffect, useRef } from 'preact/hooks';
import { resetPopupSize, setPopupSize, sizeOf, type Size } from '../state/layout.js';
import { enter, leave } from '../state/popups.js';
import { t } from '../i18n/index.js';

export function Popup({
  id,
  keys,
  class: extra = '',
  size,
  min,
  onClose,
  onEscape,
  onMouseDown,
  children,
}: {
  id: string;
  keys: KeyContext;
  class?: string;
  size: Size;
  min: Size;
  onClose: () => void;
  onEscape?: () => void;
  onMouseDown?: (event: MouseEvent) => void;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const current = sizeOf(id, size);

  const closing = useRef(onEscape ?? onClose);
  closing.current = onEscape ?? onClose;
  useEffect(() => {
    enter({ id, close: () => closing.current() });
    return () => leave(id);
  }, [id]);

  useEffect(() => {
    if (box.current?.contains(document.activeElement)) return;
    box.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div class="se-backdrop" onMouseDown={onClose}>
      <div
        ref={box}
        class={`popup ${extra}`}
        data-keys={keys}
        tabIndex={-1}
        style={{ width: `${current.w}px`, height: `${current.h}px` }}
        onMouseDown={(event) => {
          event.stopPropagation();
          onMouseDown?.(event as unknown as MouseEvent);
        }}
      >
        {children}

        <span
          class="popup-grip"
          title={t('popup.resize')}
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
            setPopupSize(
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
          onDblClick={() => resetPopupSize(id)}
        />
      </div>
    </div>
  );
}
