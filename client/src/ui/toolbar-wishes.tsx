import { keysHelp } from '../state/keys-help.js';
import { search } from '../state/search.js';
import { session } from '../state/session.js';
import { projects } from '../state/projects.js';
import { tools } from '../state/tools.js';
import { i18n } from '../i18n/index.js';
import type { Registry } from '../state/registry.js';
import { Icon, tips, type IconName } from '@ide/ui';

interface ButtonWish {
  id: string;
  title: string;
  command: string;
  icon: (filled: boolean) => unknown;
  active?: { readonly value: boolean };
  visible?: { readonly value: boolean };
}

interface WidgetWish {
  id: string;
  side: 'left' | 'right';
  view: () => unknown;
}

function ours(name: IconName) {
  return (filled: boolean) => <Icon name={name} filled={filled} />;
}

export function registerToolbarWishes(store: Registry): void {
  const button = (wish: ButtonWish) => store.add('toolbar.button', wish, 'core');
  const widget = (wish: WidgetWish) => store.add('toolbar.widget', wish, 'core');

  button({
    id: 'search',
    title: 'toolbar.search',
    command: 'search.everywhere',
    icon: ours('search'),
    active: search.open,
  });
  button({
    id: 'projects',
    title: 'toolbar.projects',
    command: 'projects.show',
    icon: ours('projects'),
    active: projects.visible,
  });
  button({
    id: 'keys',
    title: 'toolbar.keys',
    command: 'keys.show',
    icon: ours('keys'),
    active: keysHelp.open,
  });

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
