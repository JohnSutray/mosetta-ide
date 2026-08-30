import type { TerminalInfo } from '@ide/protocol';
import { computed } from '@preact/signals';
import { runCommand } from '../keys/commands.js';
import { activeTerminal, closeTerminal, focusTerminal, terminals } from '../state/terminals.js';
import { connected, current } from '../state/session.js';
import { searchOpen } from '../state/search.js';
import { branchesOpen, gitState, pushOpen } from '../state/git.js';
import { mergeOpen, mergePending } from '../state/merge.js';
import { projectsVisible } from '../state/projects.js';
import { keysHelpOpen } from '../state/keys-help.js';
import { following } from '../state/tree-follow.js';
import { currentManager, currentShell, openToolPicker } from '../state/tools.js';
import { hideTip, showTip } from '../state/tip.js';
import { keysFor } from '../keys/keys-for.js';
import { t } from '../i18n/index.js';
import { Icon, type IconName } from './icons.js';
import { PANELS } from './panels.js';
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
  const panel = PANELS.find((item) => item.id === id);
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
    active: searchOpen,
  });
  button({
    id: 'git.branches',
    title: 'toolbar.branches',
    command: 'git.branches',
    icon: ours('git'),
    active: branchesOpen,
  });
  button({
    id: 'git.push',
    title: 'toolbar.push',
    command: 'git.push',
    icon: ours('push'),
    active: pushOpen,
  });
  button({
    id: 'terminal.create',
    title: 'toolbar.terminal.create',
    command: 'terminal.create',
    icon: ours('terminal'),
  });
  button({
    id: 'projects',
    title: 'toolbar.projects',
    command: 'projects.show',
    icon: ours('projects'),
    active: projectsVisible,
  });
  button({
    id: 'keys',
    title: 'toolbar.keys',
    command: 'keys.show',
    icon: ours('keys'),
    active: keysHelpOpen,
  });
  button({
    id: 'tree.follow',
    title: 'toolbar.follow',
    command: 'tree.follow',
    icon: ours('follow'),
    active: following,
  });
  button({
    id: 'merge',
    title: 'toolbar.merge',
    command: 'merge.show',
    icon: ours('merge'),
    active: mergeOpen,
    visible: computed(() => mergePending.value > 0),
    badge: mergePending,
  });

  widget({ id: 'terminals', side: 'left', view: () => <TerminalChips /> });
  widget({ id: 'tools', side: 'right', view: () => <Tools /> });
  widget({ id: 'branch', side: 'right', view: () => <Branch /> });
  widget({ id: 'connection', side: 'right', view: () => <Connection /> });
}

function TerminalChips() {
  return (
    <>
      {terminals.value.map((info) => (
        <TerminalChip key={info.name} info={info} />
      ))}
    </>
  );
}

function Tools() {
  const ws = current.value;
  return (
    <>
      <ToolButton
        label={currentShell()}
        hint={t('tool.shell.title')}
        onClick={() => openToolPicker('shell')}
      />
      {ws && (
        <ToolButton
          label={currentManager()}
          hint={t('tool.manager.title')}
          onClick={() => openToolPicker('manager')}
        />
      )}
    </>
  );
}

function Branch() {
  const ws = current.value;
  const git = gitState.value;
  if (!ws) return null;
  return (
    <button
      class="branch-label"
      onMouseEnter={(event) =>
        showTip(event.currentTarget as Element, t('toolbar.branches'), keysFor('git.branches'))
      }
      onMouseLeave={hideTip}
      onClick={() => {
        hideTip();
        runCommand('git.branches');
      }}
    >
      {git.repo ? (git.branch ?? t('toolbar.noBranch')) : t('toolbar.noRepo')}
      {git.ahead > 0 && <span class="branch-ahead">↑{git.ahead}</span>}
      {git.behind > 0 && <span class="branch-behind">↓{git.behind}</span>}
    </button>
  );
}

function Connection() {
  return (
    <span
      class={`dot ${connected.value ? 'is-on' : 'is-off'}`}
      title={t('toolbar.connection')}
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
      onMouseEnter={(event) => showTip(event.currentTarget as Element, hint)}
      onMouseLeave={hideTip}
      onClick={() => {
        hideTip();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function TerminalChip({ info }: { info: TerminalInfo }) {
  const isCurrent = activeTerminal.value === info.name;
  const classes = [
    'term-chip',
    isCurrent ? 'is-current' : '',
    info.busy ? 'is-busy' : '',
    info.alive ? 'is-alive' : 'is-dead',
  ].join(' ');

  return (
    <span
      class={classes}
      title={`${info.name}${info.command ? ` — ${info.command}` : ''}${
        info.busy ? ` · ${t('terminal.busy', { what: info.running ?? '' })}` : ''
      }${
        info.busyUnknown ? ` · ${t('terminal.busyUnknown', { why: info.busyUnknown })}` : ''
      }${info.alive ? '' : ` (${t('terminal.dead', { code: info.exitCode ?? '?' })})`}`}
      onClick={() => focusTerminal(info.name)}
    >
      <span class="term-chip-name">{info.title}</span>
      <span
        class="term-chip-close"
        title={t('terminal.close')}
        onClick={(event) => {
          event.stopPropagation();
          void closeTerminal(info.name);
        }}
      >
        ×
      </span>
    </span>
  );
}
