import { activate, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { CODE_FONT, DARCULA, type Palette } from './palette.js';
import { STYLE } from './style.js';

export { CODE_FONT, DARCULA, type Palette } from './palette.js';

@plugin({ title: 'plugin.theme' })
export default class ThemePlugin {
  readonly palette: Palette = DARCULA;
  readonly codeFont = CODE_FONT;
  readonly dark = true;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
  }
}
