import { effect, signal } from '@preact/signals';
import { activate, command, configSection, plugin, registry, remote, stub, type Ide } from '@mosetta/ide-api/client';
import UiPlugin, { ChoicePopup, PickPopup } from '@mosetta/ide-plugin-ui';
import type { PackageManagerInfo } from './managers.js';
import type { Opener } from '@mosetta/ide-plugin-search';
import { NpmIcon, PackageIcon } from './icon.js';
import { TOOLS_DEFAULTS , TOOLS_SCHEMA} from './settings.js';
import { STYLE } from './style.js';
import { scriptId } from './script-id.js';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import type { RunPlan } from './server.js';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

export type { RunPlan } from './server.js';

export interface ScriptAction {
  id: string;
  title: string;
  icon: () => unknown;
  run: (scriptId: string) => void;
}

export const ACTION_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'icon', 'run'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, title: { type: 'string' }, icon: {}, run: {} },
} as const;

@registry({ key: 'scripts.action', schema: ACTION_SCHEMA })
@configSection({ section: 'tools', defaults: TOOLS_DEFAULTS, schema: TOOLS_SCHEMA })
@plugin({ title: 'plugin.npm-scripts' })
export default class NpmScripts {
  private readonly open = signal(false);
  private readonly known = signal<ScriptInfo[]>([]);

  readonly managers = signal<PackageManagerInfo[]>([]);
  readonly managerPicker = signal(false);

  constructor(private readonly ide: Ide) {}

  @command('scripts.open')
  protected openScripts(): void {
    this.open.value = !this.open.value;
    if (this.open.value) void this.refresh();
  }

  @command('scripts.packageManager')
  protected pickManager(): void {
    this.managerPicker.value = !this.managerPicker.value;
    if (this.managerPicker.value) void this.refreshManagers();
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    effect(() => {
      if (this.ide.project.value) void this.refreshManagers();
      else this.managers.value = [];
    });
    this.ide.registry('toolbar.widget').add({
      id: 'scripts.manager',
      side: 'right',
      chip: () => {
        const current = this.managers.value.find((one) => one.current)?.name ?? '';
        if (current === '') return null;
        return {
          icon: <PackageIcon />,
          text: current,
          tip: this.ide.t('scripts.manager.about', { manager: current }),
          onClick: () => this.ide.runCommand('scripts.packageManager'),
        };
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

    this.ide.registry('search.icon').add({
      kind: 'npm',
      icon: () => NpmIcon(true),
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

  plan(id: string): Promise<RunPlan> {
    return this.ask({ id });
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
          const actions = this.ide.registry<ScriptAction>('scripts.action').all.value;
          return (
            <>
              <span class="pick-name">
                {this.ide.getPlugin(UiPlugin).matches.highlight(scriptId.scriptOf(script.id), this.ide.getPlugin(UiPlugin).matches.shiftMatches(matches, from, script.id.length - from))}
              </span>
              <span class="pick-detail">{script.command}</span>
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  class="script-action"
                  onMouseDown={(event) => event.stopPropagation()}
                  onMouseEnter={(event) =>
                    this.ide.getPlugin(UiPlugin).windows.tips.show(event.currentTarget as Element, this.ide.t(action.title))
                  }
                  onMouseLeave={() => this.ide.getPlugin(UiPlugin).windows.tips.hide()}
                  onClick={(event) => {
                    event.stopPropagation();
                    this.ide.getPlugin(UiPlugin).windows.tips.hide();
                    this.open.value = false;
                    action.run(script.id);
                  }}
                >
                  {action.icon() as never}
                </button>
              ))}
            </>
          );
        }}
      />
    );
  }
}
