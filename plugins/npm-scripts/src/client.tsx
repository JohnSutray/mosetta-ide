import { signal } from '@preact/signals';
import { PickPopup, Plugin, highlight, shiftMatches, showTerminal } from '@ide/api';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

const RU = {
  title: 'Scripts',
  filter: 'filter scripts',
  empty: 'no scripts in this project',
  toolbar: 'package.json scripts',
};

const open = signal(false);
const known = signal<ScriptInfo[]>([]);

export default class NpmScripts extends Plugin {
  override activate(): void {
    this.command('scripts.open', 'Скрипты package.json', () => {
      open.value = !open.value;
      if (open.value) void this.refresh();
    });

    this.toolbar({
      id: 'scripts',
      title: RU.toolbar,
      icon: 'npm',
      command: 'scripts.open',
      active: open,
    });

    this.open('npm', (found) => {
      if (found.id) void this.run(found.id);
    });

    this.surface(() => this.popup());
  }

  async run(id: string): Promise<void> {
    await showTerminal(() => this.rpc.call('run', { id }) as Promise<never>);
  }

  scripts(): ScriptInfo[] {
    return known.value;
  }

  async refresh(): Promise<void> {
    try {
      known.value = (await this.rpc.call('list', null)) as ScriptInfo[];
    } catch {}
  }

  private popup() {
    if (!open.value) return null;

    const items = known.value.map((script) => ({
      key: script.id,
      text: script.id,
      value: script,
    }));

    return (
      <PickPopup
        id="scripts"
        title={RU.title}
        items={items}
        placeholder={RU.filter}
        empty={RU.empty}
        size={{ w: 620, h: 420 }}
        min={{ w: 420, h: 240 }}
        onClose={() => (open.value = false)}
        section={(script: ScriptInfo) => packageOf(script.id)}
        onPick={(script: ScriptInfo) => {
          open.value = false;
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
