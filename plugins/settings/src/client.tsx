import { activate, command, plugin, registry, settingsKey, type Ide, type SettingsEntry } from '@mosetta/ide-api/client';
import SearchPlugin from '@mosetta/ide-plugin-search';
import UiPlugin from '@mosetta/ide-plugin-ui';
import { SettingsIcon } from './icons.js';
import { SettingsPopup } from './popup.js';
import { SettingsModel, SettingsWindow } from './state.js';
import { STYLE } from './style.js';

export const REVEAL_SCHEMA = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string' }, reveal: {} },
  additionalProperties: false,
} as const;

export interface RevealLike {
  reveal(query: string): void;
}

@registry({ key: 'settings.reveal', schema: REVEAL_SCHEMA })
@plugin({ title: 'plugin.settings' })
export default class SettingsPlugin {
  readonly window = new SettingsWindow();
  readonly model = new SettingsModel();

  constructor(private readonly ide: Ide) {}

  @command('settings.show') protected show(): void { this.window.toggle(); }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<RevealLike>('settings.reveal').add({
      id: 'settings',
      reveal: (query: string) => {
        this.window.term.value = query;
        this.window.open.value = true;
      },
    } as RevealLike & { id: string });
    this.ide.registry('toolbar.button').add({
      id: 'settings',
      title: 'toolbar.settings',
      command: 'settings.show',
      icon: (filled: boolean) => <SettingsIcon filled={filled} />,
      active: this.window.open,
    });
    const entries = this.ide.registry<SettingsEntry>('settings').all;

    this.ide.registry('search.source').add({
      id: 'settings',
      kind: 'setting',
      tags: () => entries.value.map((entry) => entry.section),
      find: ({ term, tags, limit }: { term: string; tags: string[]; limit: number }) => {
        const search = this.ide.getPlugin(SearchPlugin);
        const out: Array<Record<string, unknown>> = [];
        const listing = term.trim() === '';
        const folded = search.textIndex.fold(term);
        if (listing && tags.length === 0) return [] as never;
        for (const entry of entries.value) {
          for (const key of Object.keys(entry.defaults)) {
            const label = `${entry.section}.${key}`;
            const row = { kind: 'setting', label, path: label, detail: this.ide.t(entry.title), tags: [entry.section] };
            if (listing) {
              out.push({ ...row, score: 0, matches: [] });
              continue;
            }
            const scored = search.matcher.match(search.textIndex.of(label), folded);
            if (scored) out.push({ ...row, score: scored.score, matches: scored.positions });
          }
        }
        return out.sort((a, b) => (b['score'] as number) - (a['score'] as number)).slice(0, limit) as never;
      },
    });

    this.ide.registry('search.icon').add({
      kind: 'setting',
      icon: () => <SettingsIcon />,
    });

    this.ide.registry('search.opener').add({
      kind: 'setting',
      open: (hit: { label: string }) => {
        this.window.term.value = hit.label;
        this.window.open.value = true;
      },
    });
    const layersOf = (section: string) => this.ide.registry<object>(settingsKey(section)).entries.value;
    this.ide
      .registry<() => unknown>('chrome.top')
      .add(() => (
        <SettingsPopup
          windows={this.ide.getPlugin(UiPlugin).windows}
          window={this.window}
          model={this.model}
          entries={entries}
          layersOf={layersOf}
        />
      ));
  }
}
