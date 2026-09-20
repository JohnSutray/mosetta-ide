import { useIde, useT } from '@mosetta/ide-api/client';
import type { Size } from './windows/geometry.js';
import type { Windows } from './windows/windows.js';
import type { ComponentChildren } from 'preact';
import type { KeyContext } from '@mosetta/ide-plugin-keymap';
import { useEffect, useRef } from 'preact/hooks';

/**
 * The shared frame for every popup.
 *
 * Every popup used to erect its own rectangle over a dimmer, and each had its own size
 * wired into CSS. The frame is one, because the behaviour has to be one too: the dimmer
 * closes it, a click inside does not, the corner is draggable, the size is remembered,
 * and it does not squeeze below a threshold.
 *
 * This is the same end-to-end contract as "every popup behaves alike": a new surface
 * should get the behaviour by the fact of being born rather than rewriting it.
 */
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
  /** The key the size is remembered under. */
  id: string;
  /**
   * This popup's key surface. The field is mandatory: a popup lies OVER everything, and
   * if it does not name itself its keys go to whatever is beneath — which is exactly
   * how Enter in a modal inserted a newline in the editor behind it.
   */
  keys: KeyContext;
  class?: string;
  /** The default size — until it has been dragged. */
  size: Size;
  /** It does not squeeze below this: a popup has to stay a popup. */
  min: Size;
  /**
   * The window this is DELIBERATELY opened over. Without it, a new window puts every
   * other one out: two windows at once is almost always a slip rather than an
   * intention.
   */
  over?: string;
  /**
   * A layer rather than a window: it lives inside somebody else's screen, puts no other
   * windows out and is not put out by them.
   */
  layer?: boolean;
  /**
   * A transparent background: a popup next to a row has no right to dim the whole
   * screen.
   */
  clear?: boolean;
  /**
   * Full screen. The stretching corner disappears in the process: there is nowhere to
   * drag something that already fills the screen, and an `nwse-resize` cursor over such
   * a corner would be a promise we will not keep.
   *
   * The frame is still the same one, and that is the point: the cross, the `Esc`
   * caption, the window stack and the focus come to a full-screen window by the fact of
   * being born — just as they do to a small one.
   */
  full?: boolean;
  /**
   * It holds on to a point on screen rather than standing in the centre: the question
   * was asked about a particular word, and the answer has to stay next to it.
   */
  anchor?: { x: number; y: number };
  onClose: () => void;
  /**
   * What Escape does, if that is not the same as a click on the background. In the
   * branches popup Escape peels off a layer at a time (the menu, the name entry, the
   * popup) while a click on the background closes it at once — those are different
   * intentions.
   */
  onEscape?: () => void;
  /**
   * Its own reaction to a press inside the frame — resetting the selection, for
   * instance.
   */
  onMouseDown?: (event: MouseEvent) => void;
  children: ComponentChildren;
}) {
  const t = useT();
  const mount = useIde().mount;
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const want = full ? windows.geometry.viewport.value : windows.geometry.sizeOf(id, size);
  const at = anchor ? windows.geometry.fitAnchored(want, mount.local(anchor.x, anchor.y), windows.geometry.viewport.value, min) : null;
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
        data-command={id}
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
          {!windows.catchesKeys(keys) && (
            <span class="popup-esc" title={t('popup.escape')}>
              {t('popup.esc')}
            </span>
          )}
          <span class="popup-close" title={t('popup.close')} onClick={onClose}>
            ×
          </span>
        </span>

        {children}

        {!full && (
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
