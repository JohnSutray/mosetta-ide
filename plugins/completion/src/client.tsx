import { IdeProvider, activate, command, configSection, plugin, registry, remote, stub, type Ide } from '@mosetta/ide-api/client';
import CodePlugin from '@mosetta/ide-plugin-code';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import { computed, effect, signal } from '@preact/signals';
import { render } from 'preact';
import { CompletionBridge } from './bridge.js';
import { Fuzzy } from './fuzzy.js';
import { ChoiceHistory } from './history.js';
import { CompletionList } from './popup.js';
import { Ranker } from './ranker.js';
import { CompletionSession } from './session.js';
import { COMPLETION_DEFAULTS, type CompletionSettings , COMPLETION_SCHEMA} from './settings.js';
import { BufferWords } from './sources/buffer.js';
import { LspCompletions } from './sources/lsp.js';
import { Postfix } from './sources/postfix.js';
import { STYLE } from './style.js';
import { SOURCE_SCHEMA, type Source } from './types.js';
import DocPlugin from '@mosetta/ide-plugin-doc';
import SearchPlugin from '@mosetta/ide-plugin-search';

export type { Answer, Ask, Details, Item, ItemKind, Source } from './types.js';

/**
 * Code completion is a plugin.
 *
 * The layers: the sources → merging and ordering (`CompletionSession`, `Ranker`) → the
 * bridge to the editor (`CompletionBridge`) → the list (`CompletionList`). Only the
 * bridge knows CodeMirror. The sources are entries in the `completion.source` key,
 * which this plugin declares: our own three go in there alongside the neighbours' — and
 * the next one (an AI, snippets from the config) will arrive as an entry, without an
 * edit here.
 *
 * It enters the editor as an extension through `editor.extension`, reaches the language
 * server through its plugin, and its keys are keymap rows with the `completion`
 * surface.
 */
@registry({ key: 'completion.source', schema: SOURCE_SCHEMA })
@configSection({ section: 'completion', defaults: COMPLETION_DEFAULTS, schema: COMPLETION_SCHEMA })
@plugin({ title: 'plugin.completion' })
export default class CompletionPlugin {
  /** Documents are a neighbour: what is open, where to jump, how to edit. */
  private get docs(): DocPlugin {
    return this.ide.getPlugin(DocPlugin);
  }

  constructor(private readonly ide: Ide) {}

  /** The language server is a neighbour: we ask its plugin rather than the core. */
  private get lsp(): LspPlugin {
    return this.ide.getPlugin(LspPlugin);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    const settings = computed(() => this.ide.settingsOf('completion', COMPLETION_DEFAULTS).value);
    const history = new ChoiceHistory(signal<Record<string, number>>({}), (label) => {
      void this.askChose({ label }).catch(() => undefined);
    });
    this.ide.on('chose', (payload) => {
      const heard = payload as { label: string; times: number };
      history.heard(heard.label, heard.times);
    });
    effect(() => {
      if (!this.ide.project.value) return;
      void this.askChoices()
        .then((all) => history.replace(all))
        .catch(() => undefined);
    });
    const sources = this.ide.registry<Source>('completion.source');
    const session = (this.session = new CompletionSession(
      new Ranker(new Fuzzy(this.ide.getPlugin(SearchPlugin).matcher, this.ide.getPlugin(SearchPlugin).textIndex), history),
      () => sources.all.value.filter((source) => this.enabled(source.id, settings.value)),
      () => Date.now(),
      (what, detail) =>
        this.ide.sayOnce('completion', what === 'empty' ? this.ide.t('completion.empty') : `${this.ide.t('completion.failed')} ${detail}`),
    ));

    const own: Source[] = [
      new LspCompletions(
        {
          serves: (path) => this.lsp.serves(path),
          complete: (path, line, character, trigger) => this.lsp.complete(path, line, character, trigger),
          resolveCompletion: (path, item) => this.lsp.resolveCompletion(path, item),
        },
        () => this.docs.flushDocs(),
      ),
      new Postfix(),
      new BufferWords((path) => this.lsp.serves(path)),
    ];
    for (const source of own) {
      sources.add({ id: source.id, weight: source.weight, items: (ask) => source.items(ask) });
    }

    const bridge: CompletionBridge = (this.bridge = new CompletionBridge(
      session,
      history,
      () => this.docs.openDoc.value?.path ?? null,
      () => settings.value.auto,
      (dom) => {
        render(
          <IdeProvider value={this.ide}>
            <CompletionList
              code={this.ide.getPlugin(CodePlugin)}
              session={session}
              path={() => this.docs.openDoc.value?.path ?? null}
              onPick={(index) => {
                session.select(index);
                bridge.accept('insert');
              }}
            />
          </IdeProvider>,
          dom,
        );
        return () => render(null, dom);
      },
    ));
    this.ide.registry('editor.extension').add({ id: 'completion', extension: bridge.extension() });
  }

  private session: CompletionSession | null = null;
  private bridge: CompletionBridge | null = null;

  @command('completion.show') protected show(): void { this.bridge?.showHere(); }
  @command('completion.next') protected next(): void { this.session?.move(1); }
  @command('completion.prev') protected prev(): void { this.session?.move(-1); }
  @command('completion.pageDown') protected pageDown(): void { this.session?.page(1); }
  @command('completion.pageUp') protected pageUp(): void { this.session?.page(-1); }
  @command('completion.accept') protected accept(): void { this.bridge?.accept('insert'); }
  @command('completion.replace') protected replaceWord(): void { this.bridge?.accept('replace'); }
  @command('completion.close') protected close(): void { this.session?.close(); }

  @remote('choices') protected askChoices(): Promise<Record<string, number>> {
    return stub();
  }

  @remote('chose') protected askChose(_params: { label: string }): Promise<{ label: string; times: number }> {
    return stub();
  }

  /** Our own sources are switched off by a setting; somebody else's by their own plugin. */
  private enabled(id: string, settings: CompletionSettings): boolean {
    if (id === 'buffer') return settings.words;
    if (id === 'postfix') return settings.postfix;
    return true;
  }
}
