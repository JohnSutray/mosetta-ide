import { batch, signal } from '@preact/signals';
import type { SymbolSite } from '@ide/protocol';
import { complain, openFile, openFileAt, reveal, rpc } from './session.js';
import { activeEditor } from './editor.js';

export type SymbolKind = 'definition' | 'usages';

export interface SymbolList {
  kind: SymbolKind;
  word: string;
  sites: SymbolSite[];
  at: number;
  x: number;
  y: number;
}

const IMPORTS_KEY = 'symbols.imports';

export const MAX_SITES = 200;

export const symbolList = signal<SymbolList | null>(null);
export const symbolPreview = signal<{ path: string; text: string; line: number } | null>(null);
export const hideImports = signal(localStorage.getItem(IMPORTS_KEY) !== '0');

export function toggleImports(): void {
  hideImports.value = !hideImports.value;
  localStorage.setItem(IMPORTS_KEY, hideImports.value ? '1' : '0');
  const list = symbolList.peek();
  if (list) select(0);
}

export function closeSymbols(): void {
  batch(() => {
    symbolList.value = null;
    symbolPreview.value = null;
  });
}

export function filteredSites(list: SymbolList): SymbolSite[] {
  if (!hideImports.value) return list.sites;
  const kept = list.sites.filter((site) => !site.isImport);
  return kept.length > 0 ? kept : list.sites;
}

export function shownSites(list: SymbolList): SymbolSite[] {
  return filteredSites(list).slice(0, MAX_SITES);
}

export async function askSymbol(at?: number): Promise<void> {
  const view = activeEditor.peek();
  const doc = openFile.peek();
  if (!view || !doc) return;

  const pos = at ?? view.state.selection.main.head;
  const line = view.state.doc.lineAt(pos);
  const spot = {
    path: doc.path,
    line: line.number - 1,
    character: pos - line.from,
  };
  const word = wordAt(line.text, spot.character);
  const coords = view.coordsAtPos(pos);
  const box = { x: coords?.left ?? 0, y: coords?.bottom ?? 0 };

  let definition: SymbolSite[] = [];
  try {
    definition = await rpc.call('lsp.definition', spot);
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
    return;
  }

  const elsewhere = definition.filter((site) => !samePlace(site, spot));
  if (elsewhere.length === 1) {
    jumpTo(elsewhere[0]!);
    return;
  }
  if (elsewhere.length > 1) {
    show({ kind: 'definition', word, sites: elsewhere, ...box });
    return;
  }

  try {
    const sites = await rpc.call('lsp.references', spot);
    const others = sites.filter((site) => !samePlace(site, spot));
    if (others.length === 0) {
      complain(`${word || 'symbol'}: no usages`);
      return;
    }
    show({ kind: 'usages', word, sites: others, ...box });
  } catch (err) {
    complain(err instanceof Error ? err.message : String(err));
  }
}

function show(list: Omit<SymbolList, 'at'>): void {
  symbolList.value = { ...list, at: 0 };
  select(0);
}

export function select(at: number): void {
  const list = symbolList.peek();
  if (!list) return;
  const sites = shownSites(list);
  const bounded = Math.max(0, Math.min(at, sites.length - 1));
  symbolList.value = { ...list, at: bounded };
  const site = sites[bounded];
  if (!site) {
    symbolPreview.value = null;
    return;
  }
  void rpc
    .call('doc.state', { path: site.path })
    .then((doc) => {
      if (symbolList.peek() === null) return;
      symbolPreview.value = { path: doc.path, text: doc.text, line: site.line };
    })
    .catch(() => (symbolPreview.value = null));
}

export function step(delta: number): void {
  const list = symbolList.peek();
  if (!list) return;
  const total = shownSites(list).length;
  if (total === 0) return;
  select((list.at + delta + total) % total);
}

export function accept(): void {
  const list = symbolList.peek();
  if (!list) return;
  const site = shownSites(list)[list.at];
  if (site) jumpTo(site);
}

function jumpTo(site: SymbolSite): void {
  closeSymbols();
  void openFileAt(site.path).then(() => reveal(site.path, site.line, site.character));
}

function samePlace(site: SymbolSite, spot: { path: string; line: number }): boolean {
  return site.path === spot.path && site.line === spot.line;
}

function wordAt(text: string, character: number): string {
  const left = text.slice(0, character).match(/[\w$]+$/)?.[0] ?? '';
  const right = text.slice(character).match(/^[\w$]+/)?.[0] ?? '';
  return left + right;
}
