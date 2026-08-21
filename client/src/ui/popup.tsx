import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { resetPopupSize, setPopupSize, sizeOf, type Size } from '../state/layout.js';
import { enter, leave } from '../state/popups.js';
import { t } from '../i18n/index.js';

export function Popup({
  id,
  class: extra = '',
  size,
  min,
  onClose,
  onEscape,
  onMouseDown,
  children,
}: {
  id: string;
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

  useEffect(() => {
    enter({ id, close: onEscape ?? onClose });
    return () => leave(id);
  }, [id, onClose, onEscape]);

  return (
    <div class="se-backdrop" onMouseDown={onClose}>
      <div
        ref={box}
        class={`popup ${extra}`}
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
