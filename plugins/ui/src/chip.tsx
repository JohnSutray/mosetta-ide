import type { ComponentChildren, JSX } from 'preact';

export function Chip({
  on,
  title,
  icon,
  keep,
  onToggle,
  onRemove,
  children,
}: {
  on: boolean;
  title?: string;
  icon?: ComponentChildren;
  keep?: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  children: ComponentChildren;
}): JSX.Element {
  const hold = keep === false ? undefined : (event: Event) => event.preventDefault();
  return (
    <span class={`ui-chip ${on ? 'is-on' : 'is-off'}`} title={title}>
      <button type="button" class="ui-chip-name" onMouseDown={hold} onClick={onToggle}>
        {icon ? <span class="ui-chip-icon">{icon}</span> : null}
        {children}
      </button>
      {onRemove ? (
        <button type="button" class="ui-chip-close" onMouseDown={hold} onClick={onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function ChipRow({
  struck,
  class: extra,
  keys,
  children,
}: {
  struck?: boolean;
  class?: string;
  keys?: string;
  children: ComponentChildren;
}): JSX.Element {
  return (
    <div
      class={`ui-chips ${struck ? 'is-excluding' : ''} ${extra ?? ''}`}
      data-keys={keys}
    >
      {children}
    </div>
  );
}
