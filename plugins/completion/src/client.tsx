import { activate, configSection, registry, settingsOf, t, type Ide } from '@ide/api/client';
import { flushDocs, openDoc } from '@ide/plugin-doc';
import LspPlugin from '@ide/plugin-lsp';
import { computed } from '@preact/signals';
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
    const history = new ChoiceHistory(this.ide.remember<Record<string, number>>('choices', {}));
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

  private enabled(id: string, settings: CompletionSettings): boolean {
    if (id === 'buffer') return settings.words;
    if (id === 'postfix') return settings.postfix;
    return true;
  }
}
