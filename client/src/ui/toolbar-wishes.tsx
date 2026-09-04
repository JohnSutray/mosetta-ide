import { session } from '../state/session.js';
import { tools } from '../state/tools.js';
import { i18n } from '../i18n/index.js';
import type { Registry } from '../state/registry.js';
import { tips } from '@ide/ui';

interface WidgetWish {
  id: string;
  side: 'left' | 'right';
  view: () => unknown;
}

export function registerToolbarWishes(store: Registry): void {
  const widget = (wish: WidgetWish) => store.add('toolbar.widget', wish, 'core');

  widget({ id: 'tools', side: 'right', view: () => <Tools /> });
  widget({ id: 'connection', side: 'right', view: () => <Connection /> });
}

function Tools() {
  const ws = session.current.value;
  return (
    <>
      <ToolButton
        label={tools.currentShell()}
        hint={i18n.t('tool.shell.title')}
        onClick={() => tools.open('shell')}
      />
      {ws && (
        <ToolButton
          label={tools.currentManager()}
          hint={i18n.t('tool.manager.title')}
          onClick={() => tools.open('manager')}
        />
      )}
    </>
  );
}

function Connection() {
  return (
    <span
      class={`dot ${session.connected.value ? 'is-on' : 'is-off'}`}
      title={i18n.t('toolbar.connection')}
    />
  );
}

function ToolButton({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  if (label === '') return null;
  return (
    <button
      class="tool-label"
      onMouseEnter={(event) => tips.show(event.currentTarget as Element, hint)}
      onMouseLeave={() => tips.hide()}
      onClick={() => {
        tips.hide();
        onClick();
      }}
    >
      {label}
    </button>
  );
}
