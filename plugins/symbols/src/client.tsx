import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import Editor from '@ide/plugin-editor';
import { SymbolsPopup } from './popup.js';
import { Symbols } from './state.js';
import { STYLE } from './style.js';

export default class SymbolsPlugin {
  readonly symbols: Symbols;

  constructor(private readonly ide: Ide) {
    this.symbols = new Symbols(ide);
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.getPlugin(Editor).onSymbolAsk((spot) => void this.symbols.ask(spot));
    this.ide.registry<() => unknown>('chrome.top').add(() => <SymbolsPopup symbols={this.symbols} />);
  }
}
