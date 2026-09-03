import { definition, goTo, openDoc, peekFile, references } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { batch, signal, type Signal } from '@preact/signals';
import type { SymbolSite } from '@ide/protocol';
import type { SymbolSpot } from '@ide/plugin-editor';
import { activePick } from '@ide/ui';

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

  readonly hideImports: Signal<boolean>;

  constructor(private readonly ide: Ide) {
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
    if (activePick.value === this.pick) activePick.value = null;
  }

  private readonly pick = {
    next: () => this.step(1),
    prev: () => this.step(-1),
    accept: () => this.accept(),
  };

  filtered(list: SymbolList): SymbolSite[] {
    if (!this.hideImports.value) return list.sites;
    const kept = list.sites.filter((site) => !site.isImport);
    return kept.length > 0 ? kept : list.sites;
  }

  shown(list: SymbolList): SymbolSite[] {
    return this.filtered(list).slice(0, this.maxSites);
  }

  async ask(where: SymbolSpot): Promise<void> {
    const file = openDoc.value;
    if (!file) return;

    const spot = { path: file.path, line: where.line, character: where.character };
    const word = this.wordAt(where.text, where.character);
    const box = where.box;

    let declared: SymbolSite[] = [];
    try {
      declared = await definition(spot.path, spot.line, spot.character);
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
      const sites = await references(spot.path, spot.line, spot.character);
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
    void peekFile(site.path)
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
    activePick.value = this.pick;
    this.select(0);
  }

  private jumpTo(site: SymbolSite): void {
    this.close();
    void goTo(site.path, site.line, site.character);
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
