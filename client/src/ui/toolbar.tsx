import type { TerminalInfo } from '@ide/protocol';
import { runCommand } from '../keys/commands.js';
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
                title={t(entry.title)}
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
              class="tool is-fetch"
              title={t('toolbar.fetch')}
              onClick={() => runCommand('git.fetch')}
            >
              <Icon name="fetch" filled={false} />
            </button>

            <button
              class="branch-label"
              title={t('toolbar.branches')}
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
