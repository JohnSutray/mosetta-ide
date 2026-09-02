import { batch, signal } from '@preact/signals';
import { activate, remote, stub, t, type Ide } from '@ide/api/client';
import { TerminalIcon } from './icon.js';
import { TerminalView } from './view.js';
import { Chips } from './chips.js';
import { STYLE } from './style.js';
import type { Attached, OpenAsk, TerminalInfo } from './types.js';

export default class TerminalPlugin {
  private readonly list = signal<TerminalInfo[]>([]);
  private readonly active = signal<string | null>(null);
  private readonly shown = signal(false);

  private readonly sinks = new Map<string, Set<(data: string) => void>>();

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.listen();

    this.ide.command('terminal.create', () => void this.create());
    this.ide.command('panel.terminal', () => {
      this.shown.value = !this.shown.value;
    });

    this.ide.registry('toolbar.button').add({
      id: 'terminal.create',
      title: 'toolbar.terminal.create',
      command: 'terminal.create',
      icon: TerminalIcon,
    });
    this.ide.registry('toolbar.widget').add({
      id: 'terminals',
      side: 'left',
      view: () => (
        <Chips
          list={this.list.value}
          active={this.active.value}
          onPick={(name) => this.focus(name)}
          onClose={(name) => void this.close(name)}
        />
      ),
    });

    this.ide.registry('panel').add({
      id: 'terminal',
      title: 'panel.terminal',
      side: 'right',
      open: this.shown,
      view: () => <TerminalView screen={this.screen()} />,
      close: () => {
        this.shown.value = false;
      },
      defaultWidth: 460,
      minWidth: 240,
    });

    void this.refresh();
  }

  async show(open: () => Promise<TerminalInfo>): Promise<void> {
    try {
      const info = await open();
      batch(() => {
        this.active.value = info.name;
        this.shown.value = true;
      });
      await this.refresh();
    } catch (err) {
      this.ide.say(err instanceof Error ? err.message : String(err));
    }
  }

  open(ask: OpenAsk): Promise<TerminalInfo> {
    return this.ask(ask);
  }

  showing(): string | null {
    return this.active.value;
  }

  @remote('list') protected askList(): Promise<TerminalInfo[]> {
    return stub();
  }
  @remote('create') protected askCreate(_p: { cols?: number; rows?: number }): Promise<TerminalInfo> {
    return stub();
  }
  @remote('open') protected ask(_p: OpenAsk): Promise<TerminalInfo> {
    return stub();
  }
  @remote('attach') protected askAttach(_p: { name: string }): Promise<Attached> {
    return stub();
  }
  @remote('write') protected askWrite(_p: { name: string; data: string }): Promise<null> {
    return stub();
  }
  @remote('resize') protected askResize(_p: { name: string; cols: number; rows: number }): Promise<null> {
    return stub();
  }
  @remote('close') protected askClose(_p: { name: string }): Promise<null> {
    return stub();
  }

  private create(): Promise<void> {
    return this.show(() => this.askCreate({}));
  }

  private focus(name: string): void {
    batch(() => {
      this.active.value = name;
      this.shown.value = true;
    });
  }

  private async close(name: string): Promise<void> {
    try {
      await this.askClose({ name });
    } catch (err) {
      this.ide.say(err instanceof Error ? err.message : String(err));
    }
    await this.refresh();
    if (this.active.value === name) this.active.value = this.list.value[0]?.name ?? null;
  }

  private async refresh(): Promise<void> {
    try {
      this.list.value = await this.askList();
    } catch {}
  }

  private screen() {
    return {
      name: this.active.value,
      onData: (name: string, sink: (data: string) => void) => {
        const set = this.sinks.get(name) ?? new Set();
        set.add(sink);
        this.sinks.set(name, set);
        return () => set.delete(sink);
      },
      attach: (name: string) => this.askAttach({ name }),
      write: (name: string, data: string) => {
        void this.askWrite({ name, data }).catch(() => undefined);
      },
      resize: (name: string, cols: number, rows: number) => {
        void this.askResize({ name, cols, rows }).catch(() => undefined);
      },
    };
  }

  private listen(): void {
    this.ide.on('list', (payload) => {
      const list = payload as TerminalInfo[];
      this.list.value = list;
      if (this.active.value && !list.some((info) => info.name === this.active.value)) {
        this.active.value = list[0]?.name ?? null;
      }
      if (list.length === 0) this.shown.value = false;
    });

    this.ide.on('data', (payload) => {
      const { name, data } = payload as { name: string; data: string };
      for (const sink of this.sinks.get(name) ?? []) sink(data);
    });

    this.ide.on('exit', (payload) => {
      const { name } = payload as { name: string };
      void this.refresh();
      const note = `\r\n\x1b[38;5;245m${t('terminal.finished')}\x1b[0m\r\n`;
      for (const sink of this.sinks.get(name) ?? []) sink(note);
    });
  }
}
