import { treeFollow } from '../state/tree-follow.js';
import { commands } from '../keys/commands.js';
import { keysHelp } from '../state/keys-help.js';
import { tips } from '../state/tip.js';
import { search } from '../state/search.js';
import { session } from '../state/session.js';
import { merge } from '../state/merge.js';
import { projects } from '../state/projects.js';
import { tools } from '../state/tools.js';
import { branchesWindow, git, pushWindow } from '../state/git.js';
import { computed } from '@preact/signals';
import { keysFor } from '../keys/keys-for.js';
import { i18n } from '../i18n/index.js';
import { Icon, type IconName } from './icons.js';
import { panels } from './panels.js';
import type { Registry } from '../state/registry.js';

interface ButtonWish {
  id: string;
  title: string;
  command: string;
  icon: (filled: boolean) => unknown;
  active?: { readonly value: boolean };
  visible?: { readonly value: boolean };
  badge?: { readonly value: number };
}

interface WidgetWish {
  id: string;
  side: 'left' | 'right';
  view: () => unknown;
}

function ours(name: IconName) {
  return (filled: boolean) => <Icon name={name} filled={filled} />;
}

function panelWish(id: string, icon: IconName): ButtonWish {
  const panel = panels.all.find((item) => item.id === id);
  if (!panel) throw new Error(`нет панели ${id}`);
  return { id, title: panel.tooltip, command: panel.command, icon: ours(icon), active: panel.open };
}

export function registerToolbarWishes(store: Registry): void {
  const button = (wish: ButtonWish) => store.add('toolbar.button', wish, 'core');
  const widget = (wish: WidgetWish) => store.add('toolbar.widget', wish, 'core');

  button(panelWish('tree', 'tree'));
  button({
    id: 'search',
    title: 'toolbar.search',
    command: 'search.everywhere',
    icon: ours('search'),
    active: search.open,
  });
  button({
    id: 'git.branches',
    title: 'toolbar.branches',
    command: 'git.branches',
    icon: ours('git'),
    active: branchesWindow.open,
  });
  button({
    id: 'git.push',
    title: 'toolbar.push',
    command: 'git.push',
    icon: ours('push'),
    active: pushWindow.open,
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
  button({
    id: 'tree.follow',
    title: 'toolbar.follow',
    command: 'tree.follow',
    icon: ours('follow'),
    active: treeFollow.on,
  });
  button({
    id: 'merge',
    title: 'toolbar.merge',
    command: 'merge.show',
    icon: ours('merge'),
    active: merge.open,
    visible: computed(() => merge.pending.value > 0),
    badge: merge.pending,
  });

  widget({ id: 'tools', side: 'right', view: () => <Tools /> });
  widget({ id: 'branch', side: 'right', view: () => <Branch /> });
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

function Branch() {
  const ws = session.current.value;
  const state = git.state.value;
  if (!ws) return null;
  return (
    <button
      class="branch-label"
      onMouseEnter={(event) =>
        tips.show(event.currentTarget as Element, i18n.t('toolbar.branches'), keysFor('git.branches'))
      }
      onMouseLeave={() => tips.hide()}
      onClick={() => {
        tips.hide();
        commands.run('git.branches');
      }}
    >
      {state.repo ? (state.branch ?? i18n.t('toolbar.noBranch')) : i18n.t('toolbar.noRepo')}
      {state.ahead > 0 && <span class="branch-ahead">↑{state.ahead}</span>}
      {state.behind > 0 && <span class="branch-behind">↓{state.behind}</span>}
    </button>
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
