import type { ComponentChildren, JSX } from 'preact';
import type { Windows } from './windows/windows.js';

/**
 * The view mode switch — segments in a row.
 *
 * The same as WebStorm's above markup: "text", "text and view", "view". The widget is
 * shared because the question is shared: markup, an SVG image and every view to come
 * will have exactly the same one, and three copies of one switch would drift apart
 * exactly as the six toolbar badges did.
 *
 * Every segment has an ICON and a TOOLTIP, by the interface's general rule: the icon is
 * read before the words, the tooltip explains what will happen.
 */
export interface ModeOption<T extends string> {
  id: T;
  icon: ComponentChildren;
  /** A ready string: the dictionary belongs to whoever puts the switch there. */
  tip: string;
}

export function ModeSwitch<T extends string>({
  windows,
  value,
  options,
  onPick,
}: {
  windows: Windows;
  value: T;
  options: Array<ModeOption<T>>;
  onPick: (id: T) => void;
}): JSX.Element {
  return (
    <div class="mode-switch">
      {options.map((one) => (
        <button
          key={one.id}
          type="button"
          class={`mode-switch-one ${one.id === value ? 'is-on' : ''}`}
          onMouseEnter={(event) => windows.tips.show(event.currentTarget as Element, one.tip)}
          onMouseLeave={() => windows.tips.hide()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            windows.tips.hide();
            onPick(one.id);
          }}
        >
          {one.icon}
        </button>
      ))}
    </div>
  );
}
