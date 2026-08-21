import type { TerminalInfo } from '@ide/protocol';
import { runCommand } from '../keys/commands.js';
import { activeTerminal, closeTerminal, focusTerminal, terminals } from '../state/terminals.js';
import { connected, current, error, lspStatuses, notice } from '../state/session.js';
import { Icon } from './icons.js';
import { TOOLBAR } from './panels.js';

export function Toolbar() {
  const ws = current.value;
  const lsp = lspStatuses.value[0];

  return (
    <div class="toolbar">
      <div class="toolbar-left">
        <span class="brand">new-ide</span>
        <span class="toolbar-project">{ws ? ws.name : 'проект не открыт'}</span>

        <div class="toolbar-icons">
          {TOOLBAR.map((entry) => {
            const active = entry.active?.value ?? false;
            return (
              <button
                key={entry.id}
                class={`tool ${active ? 'is-active' : ''}`}
                title={entry.title}
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
        {lsp && (
          <span class={`chip is-${lsp.state}`} title={lsp.detail ?? lsp.state}>
            {lsp.server}: {lsp.state === 'ready' ? `${lsp.openDocs} док.` : lsp.state}
          </span>
        )}
        {notice.value && <span class="toolbar-notice">{notice.value}</span>}
        {error.value && <span class="toolbar-error">{error.value}</span>}
        <span class={`dot ${connected.value ? 'is-on' : 'is-off'}`} title="Связь с бэкендом" />
      </div>
    </div>
  );
}

function TerminalChip({ info }: { info: TerminalInfo }) {
  const isCurrent = activeTerminal.value === info.name;
  const classes = [
    'term-chip',
    isCurrent ? 'is-current' : '',
    info.alive ? 'is-alive' : 'is-dead',
  ].join(' ');

  return (
    <span
      class={classes}
      title={`${info.name}${info.command ? ` — ${info.command}` : ''}${
        info.alive ? '' : ` (завершён, код ${info.exitCode ?? '?'})`
      }`}
      onClick={() => focusTerminal(info.name)}
    >
      <span class="term-chip-name">{info.title}</span>
      <span
        class="term-chip-close"
        title="Закрыть терминал"
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
