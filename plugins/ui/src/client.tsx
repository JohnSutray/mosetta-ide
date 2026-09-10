import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { Tip } from './tip.js';
import { STYLE } from './style.js';

export * from './index.js';

export default class UiPlugin {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => <Tip tips={this.ide.windows.tips} />);
  }
}
