import CodePlugin from '@mosetta/ide-plugin-code';
import { activate } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import Editor from '@mosetta/ide-plugin-editor';
import LspPlugin from '@mosetta/ide-plugin-lsp';
import { SymbolsPopup } from './popup.js';
import { Symbols } from './state.js';
import { STYLE } from './style.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

export default class SymbolsPlugin {
  readonly symbols: Symbols;

  constructor(private readonly ide: Ide) {
    this.symbols = new Symbols(ide, ide.getPlugin(LspPlugin));
  }

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.getPlugin(Editor).onSymbolAsk((spot) => void this.symbols.ask(spot));
    this.ide.registry<() => unknown>('chrome.top').add(() => <SymbolsPopup windows={this.ide.getPlugin(UiPlugin).windows} symbols={this.symbols} code={this.ide.getPlugin(CodePlugin)} />);
  }
}
