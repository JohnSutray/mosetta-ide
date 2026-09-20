import type { Ide } from '@mosetta/ide-api/client';
import { batch, signal, type Signal } from '@preact/signals';
import type { SymbolSite } from '@mosetta/ide-plugin-lsp';
import type { SymbolSpot } from '@mosetta/ide-plugin-editor';
import DocPlugin from '@mosetta/ide-plugin-doc';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * Going to a declaration, and finding usages.
 *
 * One key for two actions — that is how WebStorm does it, and that is how it reads:
 * "show me about this symbol". Standing on a usage, a human wants the declaration;
 * standing on the declaration, they want to see who uses it. Working out which they
 * meant is not their job.
 */

export type SymbolKind = 'definition' | 'usages';

export interface SymbolList {
  kind: SymbolKind;
  /** The word that was asked about — the heading is captioned with it. */
  word: string;
  sites: SymbolSite[];
  at: number;
  /** The symbol's screen coordinates: the list stands next to it. */
  x: number;
  y: number;
}

export class Symbols {
  /**
   * How many rows we draw. `null` is used thirteen hundred times in a TypeScript
   * project, and drawing that as a list means hanging the tab for the sake of data
   * nobody reads anyway. The truncation is VISIBLE as a line of its own.
   */
  readonly maxSites = 200;

  readonly list = signal<SymbolList | null>(null);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);

  /**
   * Whether to hide the import rows. They are the first thing hidden: in a list of
   * forty usages half are `import { foo } from './foo'`. The answer is remembered: a
   * human decides this once rather than in every list.
   *
   * The memory is the core's: it survives a reload, and in a test it is substituted
   * along with the host.
   */
  readonly hideImports: Signal<boolean>;

  /** Who answers about symbols — a neighbour, the language server plugin. */
  constructor(
    private readonly ide: Ide,
    private readonly lsp: {
      definition(path: string, line: number, character: number): Promise<SymbolSite[]>;
      references(path: string, line: number, character: number): Promise<SymbolSite[]>;
    },
  ) {
    this.hideImports = ide.remember('symbols.imports', true);
  }

  toggleImports(): void {
    this.hideImports.value = !this.hideImports.value;
    if (this.list.peek()) this.select(0);
  }

  close(): void {
    batch(() => {
      this.list.value = null;
      this.preview.value = null;
    });
    if (this.ide.getPlugin(UiPlugin).windows.activePick.value === this.pick) this.ide.getPlugin(UiPlugin).windows.activePick.value = null;
  }

  /** The arrows and Enter arrive as `pick.*` commands, to whoever registered for them. */
  private readonly pick = {
    next: () => this.step(1),
    prev: () => this.step(-1),
    accept: () => this.accept(),
  };

  /** What passed the import filter — before truncation. */
  filtered(list: SymbolList): SymbolSite[] {
    if (!this.hideImports.value) return list.sites;
    const kept = list.sites.filter((site) => !site.isImport);
    return kept.length > 0 ? kept : list.sites;
  }

  /** What is really visible in the list — with the filter and with the ceiling. */
  shown(list: SymbolList): SymbolSite[] {
    return this.filtered(list).slice(0, this.maxSites);
  }

  /**
   * Ask about the symbol in this place.
   *
   * The place is named by WHOEVER DRAWS THE TEXT: the line, the column, the whole line
   * itself, and where it is on screen. This used to take a live `EditorView` and get
   * everything itself — that is, the core held a reference to CodeMirror for the sake
   * of going to a declaration.
   */
  async ask(where: SymbolSpot): Promise<void> {
    const file = this.ide.getPlugin(DocPlugin).openDoc.value;
    if (!file) return;

    const spot = { path: file.path, line: where.line, character: where.character };
    const word = this.wordAt(where.text, where.character);
    const box = where.box;

    let declared: SymbolSite[] = [];
    try {
      declared = await this.lsp.definition(spot.path, spot.line, spot.character);
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
      return;
    }

    const elsewhere = declared.filter((site) => !this.samePlace(site, spot));
    if (elsewhere.length === 1) {
      this.jumpTo(elsewhere[0]!);
      return;
    }
    if (elsewhere.length > 1) {
      this.show({ kind: 'definition', word, sites: elsewhere, ...box });
      return;
    }

    try {
      const sites = await this.lsp.references(spot.path, spot.line, spot.character);
      const others = sites.filter((site) => !this.samePlace(site, spot));
      if (others.length === 0) {
        this.ide.complain(`${word || 'symbol'}: no usages`);
        return;
      }
      this.show({ kind: 'usages', word, sites: others, ...box });
    } catch (err) {
      this.ide.complain(err instanceof Error ? err.message : String(err));
    }
  }

  select(at: number): void {
    const list = this.list.peek();
    if (!list) return;
    const sites = this.shown(list);
    const bounded = Math.max(0, Math.min(at, sites.length - 1));
    this.list.value = { ...list, at: bounded };
    const site = sites[bounded];
    if (!site) {
      this.preview.value = null;
      return;
    }
    void this.ide.getPlugin(DocPlugin).peekFile(site.path)
      .then((file) => {
        if (this.list.peek() === null) return;
        this.preview.value = { path: site.path, text: file.text, line: site.line };
      })
      .catch(() => (this.preview.value = null));
  }

  step(delta: number): void {
    const list = this.list.peek();
    if (!list) return;
    const total = this.shown(list).length;
    if (total === 0) return;
    this.select((list.at + delta + total) % total);
  }

  accept(): void {
    const list = this.list.peek();
    if (!list) return;
    const site = this.shown(list)[list.at];
    if (site) this.jumpTo(site);
  }

  private show(list: Omit<SymbolList, 'at'>): void {
    this.list.value = { ...list, at: 0 };
    this.ide.getPlugin(UiPlugin).windows.activePick.value = this.pick;
    this.select(0);
  }

  private jumpTo(site: SymbolSite): void {
    this.close();
    void this.ide.getPlugin(DocPlugin).goTo(site.path, site.line, site.character);
  }

  private samePlace(site: SymbolSite, spot: { path: string; line: number }): boolean {
    return site.path === spot.path && site.line === spot.line;
  }

  /** The word under the caret — for the heading only, hence the simple rule. */
  private wordAt(text: string, character: number): string {
    const left = text.slice(0, character).match(/[\w$]+$/)?.[0] ?? '';
    const right = text.slice(character).match(/^[\w$]+/)?.[0] ?? '';
    return left + right;
  }
}
