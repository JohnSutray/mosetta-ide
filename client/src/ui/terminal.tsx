import { useEffect, useRef } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { dc, FONT } from '../editor/darcula.js';
import { rpc } from '../state/session.js';
import { activeTerminal, onTerminalData } from '../state/terminals.js';
import { t } from '../i18n/index.js';

export function TerminalView() {
  const host = useRef<HTMLDivElement>(null);
  const name = activeTerminal.value;

  useEffect(() => {
    if (!host.current || !name) return;
    let disposed = false;

    const term = new Terminal({
      fontFamily: FONT,
      fontSize: 12.5,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      scrollback: 10_000,
      theme: {
        background: dc.bg,
        foreground: dc.fg,
        cursor: dc.caret,
        selectionBackground: dc.selection,
        black: '#2B2B2B',
        red: dc.errorFg,
        green: dc.string,
        yellow: dc.annot,
        blue: dc.number,
        magenta: dc.const,
        cyan: '#299999',
        white: dc.fg,
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);

    const push = (data: string) => {
      if (!disposed) term.write(data);
    };
    const offData = onTerminalData(name, push);

    const offInput = term.onData((data) => {
      void rpc.call('term.write', { name, data }).catch(() => undefined);
    });

    const sync = () => {
      if (disposed) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      void rpc
        .call('term.resize', { name, cols: term.cols, rows: term.rows })
        .catch(() => undefined);
    };

    void rpc
      .call('term.attach', { name })
      .then(({ buffer }) => {
        if (disposed) return;
        if (buffer) term.write(buffer);
        sync();
        term.focus();
      })
      .catch(() => undefined);

    const observer = new ResizeObserver(() => sync());
    observer.observe(host.current);

    return () => {
      disposed = true;
      observer.disconnect();
      offData();
      offInput.dispose();
      term.dispose();
    };
  }, [name]);

  if (!name) {
    return <div class="placeholder">{t('terminal.empty')}</div>;
  }
  return <div class="term-host" ref={host} />;
}
