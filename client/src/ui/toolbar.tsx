import type { JSX } from 'preact';
import type { CommandId, TerminalInfo } from '@ide/protocol';
import { runCommand } from '../keys/commands.js';
import { keymap as keymapSignal } from '../state/config.js';
import { humanizeKey } from '../keys/host.js';
import { appliesHere } from '../keys/dispatcher.js';
import { activeTerminal, closeTerminal, focusTerminal, terminals } from '../state/terminals.js';
import { connected, current } from '../state/session.js';
import { gitState } from '../state/git.js';
import { mergePending } from '../state/merge.js';
import { t } from '../i18n/index.js';
import { currentManager, currentShell, openToolPicker } from '../state/tools.js';
import { hideTip, showTip } from '../state/tip.js';
import { Icon, type IconName } from './icons.js';
import { TOOLBAR } from './panels.js';
import { pluginToolbar } from '../state/plugins.js';

export function Toolbar() {
  const ws = current.value;
  const git = gitState.value;

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="toolbar-icons">
          {[...TOOLBAR.filter((entry) => entry.visible?.value ?? true), ...pluginToolbar.value].map((entry) => {
            const active = entry.active?.value ?? false;
            return (
              <button
                key={entry.id}
                class={`tool ${active ? 'is-active' : ''}`}
                onMouseEnter={(event) =>
                  showTip(event.currentTarget as Element, t(entry.title), keysFor(entry.command))
                }
                onMouseLeave={hideTip}
                onClick={() => {
                  hideTip();
                  runCommand(entry.command);
                }}
              >
                {typeof entry.icon === 'function' ? (
                  (entry.icon(active) as JSX.Element)
                ) : (
                  <Icon name={entry.icon as IconName} filled={active} />
                )}
                {entry.id === 'merge' && mergePending.value > 0 && (
                  <span class="tool-count">{mergePending.value}</span>
                )}
              </button>
            );
          })}
        </div>

        {terminals.value.map((info) => (
          <TerminalChip key={info.name} info={info} />
        ))}
      </div>

      <div class="toolbar-right">
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
        {ws && (
          <>
            <button
              class="branch-label"
              onMouseEnter={(event) =>
                showTip(
                  event.currentTarget as Element,
                  t('toolbar.branches'),
                  keysFor('git.branches'),
                )
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
          </>
        )}
        <span class={`dot ${connected.value ? 'is-on' : 'is-off'}`} title={t('toolbar.connection')} />
      </div>
    </div>
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

function keysFor(command: string): string[] {
  return keymapSignal.value.bindings
    .filter(
      (binding) =>
        binding.command === command &&
        (binding.when ?? 'global') === 'global' &&
        appliesHere(binding),
    )
    .map((binding) => humanizeKey(binding.key))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2);
}

function rank(key: string): number {
  return /\d$/.test(key) ? 0 : 1;
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
