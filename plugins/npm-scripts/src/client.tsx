import { effect, signal } from '@preact/signals';
import {
  activate,
  project,
  remote,
  runCommand,
  setSetting,
  stub,
  t,
  type Ide,
} from '@ide/api/client';
import { ChoicePopup, PickPopup, matches as pickMatches } from '@ide/ui';
import type { PackageManagerInfo } from './managers.js';
import type { Opener } from '@ide/plugin-search';
import { NpmIcon } from './icon.js';
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
      if (project.value) void this.refreshManagers();
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
            title={t('scripts.manager.hint')}
            onClick={() => runCommand('scripts.packageManager')}
          >
            {current}
          </button>
        );
      },
    });
    this.ide.registry<() => unknown>('chrome.top').add(() =>
      this.managerPicker.value ? (
        <ChoicePopup
          id="scripts.packageManager"
          title={t('scripts.manager.title')}
          note={t('scripts.manager.note')}
          rows={this.managers.value.map((one) => ({
            path: one.path,
            name: one.name,
            ref: one.path,
            current: one.current,
            mark: one.suggested
              ? t('scripts.manager.byProject')
              : one.current
                ? t('scripts.manager.inUse')
                : undefined,
          }))}
          empty={t('scripts.manager.empty')}
          customPlaceholder={t('scripts.manager.custom')}
          apply={t('scripts.manager.apply')}
          reset={t('scripts.manager.default')}
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
      await setSetting('tools', 'packageManager', ref);
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
      <PickPopup
        id="scripts"
        title={t('scripts.title')}
        items={items}
        placeholder={t('scripts.filter')}
        empty={t('scripts.empty')}
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
                {pickMatches.highlight(scriptId.scriptOf(script.id), pickMatches.shiftMatches(matches, from, script.id.length - from))}
              </span>
              <span class="pick-detail">{script.command}</span>
            </>
          );
        }}
      />
    );
  }
}
