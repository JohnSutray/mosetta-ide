import type { CommandId, TerminalInfo } from '@ide/protocol';
import { runCommand } from '../keys/commands.js';
import { keymap as keymapSignal } from '../state/config.js';
import { humanizeKey } from '../keys/host.js';
import { resolveClip } from '../keys/dispatcher.js';
import { activeTerminal, closeTerminal, focusTerminal, terminals } from '../state/terminals.js';
import { connected, current } from '../state/session.js';
import { gitState } from '../state/git.js';
import { t } from '../i18n/index.js';
import { Icon } from './icons.js';
import { TOOLBAR } from './panels.js';

export function Toolbar() {
  const ws = current.value;
  const git = gitState.value;

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <div class="toolbar-icons">
          {TOOLBAR.map((entry) => {
            const active = entry.active?.value ?? false;
            return (
              <button
                key={entry.id}
                class={`tool ${active ? 'is-active' : ''}`}
                title={withKeys(t(entry.title), entry.command)}
                onClick={() => runCommand(entry.command)}
              >
                <Icon name={entry.icon} filled={active} />
              </button>
            );
          })}
        </div>

        {terminals.value.map((info) => (
          <TerminalChip key={info.name} info={info} />
        ))}
      </div>

      <div class="toolbar-right">
        {ws && (
          <>
            <button
              class="branch-label"
              title={withKeys(t('toolbar.branches'), 'git.branches')}
              onClick={() => runCommand('git.branches')}
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

function withKeys(title: string, command: CommandId): string {
  const keys = keymapSignal.value.bindings
    .filter((binding) => binding.command === command && (binding.when ?? 'global') === 'global')
    .map((binding) => humanizeKey(resolveClip(binding.key)))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 2);
  return keys.length ? `${title} · ${keys.join(' · ')}` : title;
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
