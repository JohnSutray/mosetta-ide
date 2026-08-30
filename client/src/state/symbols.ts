import { doc, rpc } from './session.js';
import { complain } from './notifications.js';
import { batch, signal } from '@preact/signals';
import { persisted } from './persist.js';
import type { SymbolSite } from '@ide/protocol';

export type SymbolKind = 'definition' | 'usages';

export interface SymbolList {
  kind: SymbolKind;
  word: string;
  sites: SymbolSite[];
  at: number;
  x: number;
  y: number;
}

export class Symbols {
  readonly maxSites = 200;

  readonly list = signal<SymbolList | null>(null);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);

  readonly hideImports = persisted('symbols.imports', true);

  toggleImports(): void {
    this.hideImports.value = !this.hideImports.value;
    if (this.list.peek()) this.select(0);
  }

  close(): void {
    batch(() => {
      this.list.value = null;
      this.preview.value = null;
    });
  }

  filtered(list: SymbolList): SymbolSite[] {
    if (!this.hideImports.value) return list.sites;
    const kept = list.sites.filter((site) => !site.isImport);
    return kept.length > 0 ? kept : list.sites;
  }

  shown(list: SymbolList): SymbolSite[] {
    return this.filtered(list).slice(0, this.maxSites);
  }

  async ask(where: SymbolAsk): Promise<void> {
    const file = doc.open.peek();
    if (!file) return;

    const spot = { path: file.path, line: where.line, character: where.character };
    const word = this.wordAt(where.text, where.character);
    const box = where.box;

    let definition: SymbolSite[] = [];
    try {
      definition = await rpc.call('lsp.definition', spot);
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
      return;
    }

    const elsewhere = definition.filter((site) => !this.samePlace(site, spot));
    if (elsewhere.length === 1) {
      this.jumpTo(elsewhere[0]!);
      return;
    }
    if (elsewhere.length > 1) {
      this.show({ kind: 'definition', word, sites: elsewhere, ...box });
      return;
    }

    try {
      const sites = await rpc.call('lsp.references', spot);
      const others = sites.filter((site) => !this.samePlace(site, spot));
      if (others.length === 0) {
        complain(`${word || 'symbol'}: no usages`);
        return;
      }
      this.show({ kind: 'usages', word, sites: others, ...box });
    } catch (err) {
      complain(err instanceof Error ? err.message : String(err));
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
    void rpc
      .call('doc.state', { path: site.path })
      .then((doc) => {
        if (this.list.peek() === null) return;
        this.preview.value = { path: site.path, text: doc.text, line: site.line };
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
    this.select(0);
  }

  private jumpTo(site: SymbolSite): void {
    this.close();
    void doc.openAt(site.path).then(() => doc.reveal(site.path, site.line, site.character));
  }

  private samePlace(site: SymbolSite, spot: { path: string; line: number }): boolean {
    return site.path === spot.path && site.line === spot.line;
  }

  private wordAt(text: string, character: number): string {
    const left = text.slice(0, character).match(/[\w$]+$/)?.[0] ?? '';
    const right = text.slice(character).match(/^[\w$]+/)?.[0] ?? '';
    return left + right;
  }
}

export interface SymbolAsk {
  line: number;
  character: number;
  text: string;
  box: { x: number; y: number };
}

export const symbols = new Symbols();
