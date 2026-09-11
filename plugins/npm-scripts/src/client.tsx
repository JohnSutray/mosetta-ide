import { effect, signal } from '@preact/signals';
import { activate, configSection, remote, stub, type Ide } from '@ide/api/client';
import UiPlugin, { ChoicePopup, PickPopup } from '@ide/ui';
import type { PackageManagerInfo } from './managers.js';
import type { Opener } from '@ide/plugin-search';
import { NpmIcon } from './icon.js';
import { TOOLS_DEFAULTS } from './settings.js';
import { STYLE } from './style.js';
import { scriptId } from './script-id.js';
import TerminalPlugin from '@ide/plugin-terminal';
import type { RunPlan } from './server.js';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

@configSection({ section: 'tools', defaults: TOOLS_DEFAULTS })
export default class NpmScripts {
  private readonly open = signal(false);
  private readonly known = signal<ScriptInfo[]>([]);

  readonly managers = signal<PackageManagerInfo[]>([]);
  readonly managerPicker = signal(false);

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.command('scripts.open', () => {
      this.open.value = !this.open.value;
      if (this.open.value) void this.refresh();
    });

    this.ide.command('scripts.packageManager', () => {
      this.managerPicker.value = !this.managerPicker.value;
      if (this.managerPicker.value) void this.refreshManagers();
    });
    effect(() => {
      if (this.ide.project.value) void this.refreshManagers();
      else this.managers.value = [];
    });
    this.ide.registry('toolbar.widget').add({
      id: 'scripts.manager',
      side: 'right',
      view: () => {
        const current = this.managers.value.find((one) => one.current)?.name ?? '';
        if (current === '') return null;
        return (
          <button
            class="scripts-manager-label"
            title={this.ide.t('scripts.manager.hint')}
            onClick={() => this.ide.runCommand('scripts.packageManager')}
          >
            {current}
          </button>
        );
      },
    });
    this.ide.registry<() => unknown>('chrome.top').add(() =>
      this.managerPicker.value ? (
        <ChoicePopup windows={this.ide.getPlugin(UiPlugin).windows}
          id="scripts.packageManager"
          title={this.ide.t('scripts.manager.title')}
          note={this.ide.t('scripts.manager.note')}
          rows={this.managers.value.map((one) => ({
            path: one.path,
            name: one.name,
            ref: one.path,
            current: one.current,
            mark: one.suggested
              ? this.ide.t('scripts.manager.byProject')
              : one.current
                ? this.ide.t('scripts.manager.inUse')
                : undefined,
          }))}
          empty={this.ide.t('scripts.manager.empty')}
          customPlaceholder={this.ide.t('scripts.manager.custom')}
          apply={this.ide.t('scripts.manager.apply')}
          reset={this.ide.t('scripts.manager.default')}
          onChoose={(ref) => void this.chooseManager(ref)}
          onClose={() => (this.managerPicker.value = false)}
        />
      ) : null,
    );

    this.ide.registry('toolbar.button').add({
      id: 'scripts',
      title: 'toolbar.scripts',
      command: 'scripts.open',
      icon: NpmIcon,
      active: this.open,
    });

    this.ide.registry<Opener>('search.opener').add({
      kind: 'npm',
      open: (found) => {
        if (found.id) void this.run(found.id);
      },
    });

    this.ide.surface(() => this.popup());
  }

  async refreshManagers(): Promise<void> {
    try {
      this.managers.value = await this.askManagers();
    } catch (err) {
      this.managers.value = [];
      this.ide.complain(`package managers: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async chooseManager(ref: string): Promise<void> {
    try {
      await this.ide.setSetting('tools', 'packageManager', ref);
      this.managerPicker.value = false;
      await this.refreshManagers();
      this.ide.say(ref === '' ? 'package manager: default' : `package manager: ${ref}`);
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  @remote('managers') protected askManagers(): Promise<PackageManagerInfo[]> {
    return stub();
  }

  @remote() protected list(): Promise<ScriptInfo[]> {
    return stub();
  }

  @remote('run') protected ask(_params: { id: string }): Promise<RunPlan> {
    return stub();
  }

  async run(id: string): Promise<void> {
    const terminal = this.ide.getPlugin(TerminalPlugin);
    await terminal.show(async () => {
      const plan = await this.ask({ id });
      return terminal.open({ ...plan, kind: 'script' });
    });
  }

  scripts(): ScriptInfo[] {
    return this.known.value;
  }

  async refresh(): Promise<void> {
    try {
      this.known.value = await this.list();
    } catch (err) {
      this.ide.say(`scripts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private popup() {
    if (!this.open.value) return null;

    const items = this.known.value.map((script) => ({
      key: script.id,
      text: script.id,
      value: script,
    }));

    return (
      <PickPopup windows={this.ide.getPlugin(UiPlugin).windows}
        id="scripts"
        title={this.ide.t('scripts.title')}
        items={items}
        placeholder={this.ide.t('scripts.filter')}
        empty={this.ide.t('scripts.empty')}
        size={{ w: 620, h: 420 }}
        min={{ w: 420, h: 240 }}
        onClose={() => (this.open.value = false)}
        section={(script: ScriptInfo) => scriptId.packageOf(script.id)}
        onPick={(script: ScriptInfo) => {
          this.open.value = false;
          void this.run(script.id);
        }}
        row={(script: ScriptInfo, matches: number[]) => {
          const from = scriptId.packageOf(script.id).length + scriptId.sep.length;
          return (
            <>
              <span class="pick-name">
                {this.ide.getPlugin(UiPlugin).matches.highlight(scriptId.scriptOf(script.id), this.ide.getPlugin(UiPlugin).matches.shiftMatches(matches, from, script.id.length - from))}
              </span>
              <span class="pick-detail">{script.command}</span>
            </>
          );
        }}
      />
    );
  }
}
