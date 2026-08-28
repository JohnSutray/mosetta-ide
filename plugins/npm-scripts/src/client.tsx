import { signal } from '@preact/signals';
import {
  PickPopup,
  activate,
  highlight,
  remote,
  shiftMatches,
  showTerminal,
  stub,
  t,
  type Ide,
} from '@ide/api/client';
import { NpmIcon } from './icon.js';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

export default class NpmScripts {
  private readonly open = signal(false);
  private readonly known = signal<ScriptInfo[]>([]);

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.command('scripts.open', () => {
      this.open.value = !this.open.value;
      if (this.open.value) void this.refresh();
    });

    this.ide.toolbar({
      id: 'scripts',
      title: 'toolbar.scripts',
      icon: NpmIcon,
      command: 'scripts.open',
      active: this.open,
    });

    this.ide.open('npm', (found) => {
      if (found.id) void this.run(found.id);
    });

    this.ide.surface(() => this.popup());
  }

  @remote() protected list(): Promise<ScriptInfo[]> {
    return stub();
  }

  @remote('run') protected ask(_params: { id: string }): Promise<never> {
    return stub();
  }

  async run(id: string): Promise<void> {
    await showTerminal(() => this.ask({ id }));
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
        section={(script: ScriptInfo) => packageOf(script.id)}
        onPick={(script: ScriptInfo) => {
          this.open.value = false;
          void this.run(script.id);
        }}
        row={(script: ScriptInfo, matches: number[]) => {
          const from = packageOf(script.id).length + SEP.length;
          return (
            <>
              <span class="pick-name">
                {highlight(nameOf(script.id), shiftMatches(matches, from, script.id.length - from))}
              </span>
              <span class="pick-detail">{script.command}</span>
            </>
          );
        }}
      />
    );
  }
}

const SEP = '::';

function packageOf(id: string): string {
  const at = id.lastIndexOf(SEP);
  return at === -1 ? '' : id.slice(0, at);
}

function nameOf(id: string): string {
  const at = id.lastIndexOf(SEP);
  return at === -1 ? id : id.slice(at + SEP.length);
}
