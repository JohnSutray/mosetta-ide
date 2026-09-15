import type { ComponentChildren, JSX } from 'preact';
import type { Windows } from './windows/windows.js';

export interface ModeOption<T extends string> {
  id: T;
  icon: ComponentChildren;
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
