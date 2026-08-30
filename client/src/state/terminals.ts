import { terminalPanelVisible } from '../ui/panels.js';
import { rpc } from './session.js';
import { complain } from './notifications.js';
import { batch, signal } from '@preact/signals';
import type { TerminalInfo } from '@ide/protocol';
import { t } from '../i18n/index.js';

type DataSink = (data: string) => void;

export class Terminals {
  readonly list = signal<TerminalInfo[]>([]);
  readonly active = signal<string | null>(null);

  private readonly sinks = new Map<string, Set<DataSink>>();

  constructor() {
    this.listen();
  }

  onData(name: string, sink: DataSink): () => void {
    const set = this.sinks.get(name) ?? new Set();
    set.add(sink);
    this.sinks.set(name, set);
    return () => set.delete(sink);
  }

  async refresh(): Promise<void> {
    try {
      this.list.value = await rpc.call('term.list', null);
    } catch {}
  }

  async create(): Promise<void> {
    await this.show(() => rpc.call('term.create', {}));
  }

  focus(name: string): void {
    batch(() => {
      this.active.value = name;
      terminalPanelVisible.value = true;
    });
  }

  async close(name: string): Promise<void> {
    try {
      await rpc.call('term.close', { name });
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
    }
    await this.refresh();
    if (this.active.value === name) {
      this.active.value = this.list.value[0]?.name ?? null;
    }
  }

  async show(open: () => Promise<TerminalInfo>): Promise<void> {
    try {
      const info = await open();
      batch(() => {
        this.active.value = info.name;
        terminalPanelVisible.value = true;
      });
      await this.refresh();
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
    }
  }

  private listen(): void {
    rpc.on('term.list', (list) => {
      this.list.value = list;
      if (this.active.value && !list.some((info) => info.name === this.active.value)) {
        this.active.value = list[0]?.name ?? null;
      }
      if (list.length === 0) terminalPanelVisible.value = false;
    });

    rpc.on('term.data', ({ name, data }) => {
      for (const sink of this.sinks.get(name) ?? []) sink(data);
    });

    rpc.on('term.exit', ({ name }) => {
      void this.refresh();
      const note = `\r\n\x1b[38;5;245m${t('terminal.finished')}\x1b[0m\r\n`;
      for (const sink of this.sinks.get(name) ?? []) sink(note);
    });
  }
}

export const terminals = new Terminals();
