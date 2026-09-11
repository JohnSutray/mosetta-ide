/// <reference path="./raw.d.ts" />
import { batch, signal } from '@preact/signals';
import { activate, configSection, remote, stub, type Ide } from '@mosetta/ide-api/client';
import UiPlugin, { ChoicePopup } from '@mosetta/ide-plugin-ui';
import { TerminalIcon } from './icon.js';
import ThemePlugin from '@mosetta/ide-plugin-theme';
import { TerminalView } from './view.js';
import { Chips } from './chips.js';
import { TERMINAL_DEFAULTS } from './settings.js';
import xtermCss from '@xterm/xterm/css/xterm.css?raw';
import { STYLE } from './style.js';
import type { Attached, OpenAsk, ShellInfo, TerminalInfo } from './types.js';

@configSection({ section: 'terminal', defaults: TERMINAL_DEFAULTS })
export default class TerminalPlugin {
  private readonly list = signal<TerminalInfo[]>([]);
  private readonly active = signal<string | null>(null);
  private readonly shown = signal(false);

  private readonly sinks = new Map<string, Set<(data: string) => void>>();

  readonly shells = signal<ShellInfo[]>([]);
  readonly shellPicker = signal(false);

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(xtermCss + STYLE);
    this.listen();

    this.ide.command('terminal.create', () => void this.create());
    this.ide.command('terminal.shell', () => {
      this.shellPicker.value = !this.shellPicker.value;
      if (this.shellPicker.value) void this.refreshShells();
    });
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
      id: 'terminal.shell',
      side: 'right',
      view: () => {
        const current = this.shells.value.find((one) => one.current)?.name ?? '';
        if (current === '') return null;
        return (
          <button
            class="terminal-shell-label"
            title={this.ide.t('terminal.shell.hint')}
            onClick={() => this.ide.runCommand('terminal.shell')}
          >
            {current}
          </button>
        );
      },
    });
    this.ide.registry<() => unknown>('chrome.top').add(() =>
      this.shellPicker.value ? (
        <ChoicePopup windows={this.ide.getPlugin(UiPlugin).windows}
          id="terminal.shell"
          title={this.ide.t('terminal.shell.title')}
          note={this.ide.t('terminal.shell.note')}
          rows={this.shells.value.map((one) => ({
            path: one.path,
            name: one.name,
            ref: one.ref,
            current: one.current,
            mark: one.current ? this.ide.t('terminal.shell.inUse') : undefined,
          }))}
          empty={this.ide.t('terminal.shell.empty')}
          customPlaceholder={this.ide.t('terminal.shell.custom')}
          apply={this.ide.t('terminal.shell.apply')}
          reset={this.ide.t('terminal.shell.default')}
          onChoose={(ref) => void this.chooseShell(ref)}
          onClose={() => (this.shellPicker.value = false)}
        />
      ) : null,
    );
    void this.refreshShells();

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
      view: () => <TerminalView screen={this.screen()} palette={this.ide.getPlugin(ThemePlugin).palette} />,
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

  async refreshShells(): Promise<void> {
    try {
      this.shells.value = await this.askShells();
    } catch (err) {
      this.shells.value = [];
      this.ide.complain(`shells: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async chooseShell(ref: string): Promise<void> {
    try {
      await this.ide.setSetting('terminal', 'shell', ref);
      this.shellPicker.value = false;
      await this.refreshShells();
      this.ide.say(ref === '' ? 'shell: default' : `shell: ${ref}`);
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  @remote('shells') protected askShells(): Promise<ShellInfo[]> {
    return stub();
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
      const note = `\r\n\x1b[38;5;245m${this.ide.t('terminal.finished')}\x1b[0m\r\n`;
      for (const sink of this.sinks.get(name) ?? []) sink(note);
    });
  }
}
