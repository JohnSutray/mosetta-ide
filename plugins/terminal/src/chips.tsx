import { useT } from '@mosetta/ide-api/client';
import type { TerminalInfo } from './types.js';

/**
 * The terminal chips in the toolbar.
 *
 * Not a button: there are several terminals, and one icon will not show their state.
 * The toolbar's registry knows this and takes markup from us rather than an icon —
 * `toolbar.widget` instead of `toolbar.button`.
 *
 * Blue lights up for WORK only: the foreground process in the terminal is not the
 * shell. The one shown right now is outlined, a dead one is dimmed — but it stays; its
 * output is still wanted.
 */
export function Chips({
  list,
  active,
  onPick,
  onClose,
}: {
  list: TerminalInfo[];
  active: string | null;
  onPick: (name: string) => void;
  onClose: (name: string) => void;
}) {
  return (
    <>
      {list.map((info) => (
        <Chip
          key={info.name}
          info={info}
          current={active === info.name}
          onPick={onPick}
          onClose={onClose}
        />
      ))}
    </>
  );
}

function Chip({
  info,
  current,
  onPick,
  onClose,
}: {
  info: TerminalInfo;
  current: boolean;
  onPick: (name: string) => void;
  onClose: (name: string) => void;
}) {
  const t = useT();
  const classes = [
    'term-chip',
    current ? 'is-current' : '',
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
      }${info.alive ? '' : ` (${t('terminal.dead', { code: String(info.exitCode ?? '?') })})`}`}
      onClick={() => onPick(info.name)}
    >
      <span class="term-chip-name">{info.title}</span>
      <span
        class="term-chip-close"
        title={t('terminal.close')}
        onClick={(event) => {
          event.stopPropagation();
          onClose(info.name);
        }}
      >
        ×
      </span>
    </span>
  );
}
