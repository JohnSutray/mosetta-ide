import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  actions?: ComponentChildren;
  onClose?: () => void;
  children: ComponentChildren;
  class?: string;
  width?: number;
}

export function Panel({
  title,
  actions,
  onClose,
  children,
  class: extra = '',
  width,
}: Props) {
  return (
    <section
      class={`panel ${extra}`}
      style={width === undefined ? undefined : { width: `${width}px`, flex: 'none' }}
    >
      <header class="panel-head">
        <span class="panel-title">{title}</span>
        <span class="panel-actions">
          {actions}
          {onClose && (
            <span class="panel-close" title="Закрыть панель" onClick={onClose}>
              ×
            </span>
          )}
        </span>
      </header>
      <div class="panel-body">{children}</div>
    </section>
  );
}
