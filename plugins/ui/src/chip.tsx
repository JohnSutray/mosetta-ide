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

export function Tag({ name }: { name: string }): JSX.Element {
  const hue = hueOf(name);
  return (
    <span
      class="ui-tag"
      style={{ color: `hsl(${hue} 52% 70%)`, background: `hsl(${hue} 52% 70% / 0.15)` }}
    >
      {name}
    </span>
  );
}

function hueOf(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 360;
}
