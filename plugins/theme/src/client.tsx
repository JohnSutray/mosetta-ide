import { activate, plugin } from '@mosetta/ide-api/client';
import type { Ide } from '@mosetta/ide-api/client';
import { CODE_FONT, DARCULA, type Palette } from './palette.js';
import { STYLE } from './style.js';

export { CODE_FONT, DARCULA, type Palette } from './palette.js';

/**
 * The theme is a plugin. Two halves of one palette: the CSS variables `--bg`, `--fg`,
 * `--panel-bg` and the rest, which every plugin writes its styles with, and the same
 * Darcula as DATA by role — for those who draw without styles: the code display
 * assembles the editor theme and the highlighting from it, the terminal its console
 * colours. Neighbours take it through `ide.getPlugin(ThemePlugin)` rather than by
 * import.
 */
@plugin({ title: 'plugin.theme' })
export default class ThemePlugin {
  readonly palette: Palette = DARCULA;
  readonly codeFont = CODE_FONT;
  /** Whether the theme is dark: CodeMirror picks its own base colours to match. */
  readonly dark = true;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.css(STYLE);
  }
}
