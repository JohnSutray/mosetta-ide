import type { ComponentChildren } from 'preact';
import type { KeyContext } from '@ide/protocol';
import { useEffect, useRef } from 'preact/hooks';
import {
  fitAnchored,
  resetPopupSize,
  setPopupSize,
  sizeOf,
  viewport,
  type Size,
} from '../state/layout.js';
import { enter, leave } from '../state/popups.js';
import { catchesKeys } from '../keys/dispatcher.js';
import { t } from '../i18n/index.js';

export function Popup({
  id,
  keys,
  class: extra = '',
  size,
  min,
  over,
  layer,
  clear,
  anchor,
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
  over?: string;
  layer?: boolean;
  clear?: boolean;
  anchor?: { x: number; y: number };
  onClose: () => void;
  onEscape?: () => void;
  onMouseDown?: (event: MouseEvent) => void;
  children: ComponentChildren;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = sizeOf(id, size);
  const at = anchor ? fitAnchored(want, anchor, viewport.value, min) : null;
  const current = at ? { w: at.w, h: at.h } : want;

  const closing = useRef(onEscape ?? onClose);
  closing.current = onEscape ?? onClose;
  useEffect(() => {
    enter({ id, close: () => closing.current(), over, layer, el: box.current });
    return () => leave(id);
  }, [id, over, layer]);

  useEffect(() => {
    if (box.current?.contains(document.activeElement)) return;
    box.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div class={`se-backdrop ${clear ? 'is-clear' : ''}`} onMouseDown={onClose}>
      <div
        ref={box}
        class={`popup ${at ? 'is-anchored' : ''} ${extra}`}
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
          {!catchesKeys(keys) && (
            <span class="popup-esc" title={t('popup.escape')}>
              {t('popup.esc')}
            </span>
          )}
          <span class="popup-close" title={t('popup.close')} onClick={onClose}>
            ×
          </span>
        </span>

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
