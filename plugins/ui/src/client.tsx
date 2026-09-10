import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { Tip } from './tip.js';
import { STYLE } from './style.js';
import { fuzzy } from './fuzzy.js';
import { matches } from './pick-popup.js';

export * from './index.js';

export default class UiPlugin {
  readonly fuzzy = fuzzy;
  readonly matches = matches;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
    this.ide.registry<() => unknown>('chrome.top').add(() => <Tip tips={this.ide.windows.tips} />);
  }
}
