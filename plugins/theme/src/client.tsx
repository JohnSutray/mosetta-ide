import { activate } from '@ide/api/client';
import type { Ide } from '@ide/api/client';
import { STYLE } from './style.js';

export default class ThemePlugin {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
  }
}
