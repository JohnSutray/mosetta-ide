import { activate, configSection, project, registry, remote, settingsOf, stub, t, type Ide } from '@ide/api/client';
import { flushDocs, openDoc } from '@ide/plugin-doc';
import CodePlugin from '@ide/plugin-code';
import LspPlugin from '@ide/plugin-lsp';
import { computed, effect, signal } from '@preact/signals';
import { render } from 'preact';
import { CompletionBridge } from './bridge.js';
import { Fuzzy } from './fuzzy.js';
import { ChoiceHistory } from './history.js';
import { CompletionList } from './popup.js';
import { Ranker } from './ranker.js';
import { CompletionSession } from './session.js';
import { COMPLETION_DEFAULTS, type CompletionSettings } from './settings.js';
import { BufferWords } from './sources/buffer.js';
import { LspCompletions } from './sources/lsp.js';
import { Postfix } from './sources/postfix.js';
import { STYLE } from './style.js';
import { SOURCE_SCHEMA, type Source } from './types.js';

export type { Answer, Ask, Details, Item, ItemKind, Source } from './types.js';

@registry({ key: 'completion.source', schema: SOURCE_SCHEMA })
@configSection({ section: 'completion', defaults: COMPLETION_DEFAULTS })
export default class CompletionPlugin {
  constructor(private readonly ide: Ide) {}

  private get lsp(): LspPlugin {
    return this.ide.getPlugin(LspPlugin);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const settings = computed(() => settingsOf('completion', COMPLETION_DEFAULTS).value);
    const history = new ChoiceHistory(signal<Record<string, number>>({}), (label) => {
      void this.askChose({ label }).catch(() => undefined);
    });
    this.ide.on('chose', (payload) => {
      const heard = payload as { label: string; times: number };
      history.heard(heard.label, heard.times);
    });
    effect(() => {
      if (!project.value) return;
      void this.askChoices()
        .then((all) => history.replace(all))
        .catch(() => undefined);
    });
    const sources = this.ide.registry<Source>('completion.source');
    const session = new CompletionSession(
      new Ranker(new Fuzzy(), history),
      () => sources.all.value.filter((source) => this.enabled(source.id, settings.value)),
      () => Date.now(),
      (what, detail) =>
        this.ide.sayOnce('completion', what === 'empty' ? t('completion.empty') : `${t('completion.failed')} ${detail}`),
    );

    const own: Source[] = [
      new LspCompletions(
        {
          serves: (path) => this.lsp.serves(path),
          complete: (path, line, character, trigger) => this.lsp.complete(path, line, character, trigger),
          resolveCompletion: (path, item) => this.lsp.resolveCompletion(path, item),
        },
        flushDocs,
      ),
      new Postfix(),
      new BufferWords((path) => this.lsp.serves(path)),
    ];
    for (const source of own) {
      sources.add({ id: source.id, weight: source.weight, items: (ask) => source.items(ask) });
    }

    const bridge: CompletionBridge = new CompletionBridge(
      session,
      history,
      () => openDoc.value?.path ?? null,
      () => settings.value.auto,
      (dom) => {
        render(
          <CompletionList
            code={this.ide.getPlugin(CodePlugin)}
            session={session}
            path={() => openDoc.value?.path ?? null}
            onPick={(index) => {
              session.select(index);
              bridge.accept('insert');
            }}
          />,
          dom,
        );
        return () => render(null, dom);
      },
    );
    this.ide.registry('editor.extension').add({ id: 'completion', extension: bridge.extension() });

    this.ide.command('completion.show', () => bridge.showHere());
    this.ide.command('completion.next', () => session.move(1));
    this.ide.command('completion.prev', () => session.move(-1));
    this.ide.command('completion.pageDown', () => session.page(1));
    this.ide.command('completion.pageUp', () => session.page(-1));
    this.ide.command('completion.accept', () => bridge.accept('insert'));
    this.ide.command('completion.replace', () => bridge.accept('replace'));
    this.ide.command('completion.close', () => session.close());
  }

  @remote('choices') protected askChoices(): Promise<Record<string, number>> {
    return stub();
  }

  @remote('chose') protected askChose(_params: { label: string }): Promise<{ label: string; times: number }> {
    return stub();
  }

  private enabled(id: string, settings: CompletionSettings): boolean {
    if (id === 'buffer') return settings.words;
    if (id === 'postfix') return settings.postfix;
    return true;
  }
}
