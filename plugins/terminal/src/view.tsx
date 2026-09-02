import { useEffect, useRef } from 'preact/hooks';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { unstable_dc as dc, t } from '@ide/api/client';
import type { Attached } from './types.js';

const FONT = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

export interface Screen {
  name: string | null;
  onData(name: string, sink: (data: string) => void): () => void;
  attach(name: string): Promise<Attached>;
  write(name: string, data: string): void;
  resize(name: string, cols: number, rows: number): void;
}

export function TerminalView({ screen }: { screen: Screen }) {
  const host = useRef<HTMLDivElement>(null);
  const name = screen.name;

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

    const offData = screen.onData(name, (data) => {
      if (!disposed) term.write(data);
    });

    const offInput = term.onData((data) => screen.write(name, data));

    const sync = () => {
      if (disposed) return;
      try {
        fit.fit();
      } catch {
        return;
      }
      screen.resize(name, term.cols, term.rows);
    };

    void screen
      .attach(name)
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
  return <div class="term-host" data-keys="terminal" ref={host} />;
}
