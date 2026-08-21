import type { ComponentChildren } from 'preact';

interface Props {
  title: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
}

export function Panel({ title, actions, children, class: extra = '' }: Props) {
  return (
    <section class={`panel ${extra}`}>
      <header class="panel-head">
        <span class="panel-title">{title}</span>
        {actions ? <span class="panel-actions">{actions}</span> : null}
      </header>
      <div class="panel-body">{children}</div>
    </section>
  );
}
