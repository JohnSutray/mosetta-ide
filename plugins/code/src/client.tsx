import type { Ide } from '@mosetta/ide-api/client';
import ThemePlugin from '@mosetta/ide-plugin-theme';
import { CodeView, type CodeViewProps } from './code-view.js';
import { InputMechanics } from './input-keymap.js';
import { Languages } from './languages.js';
import { LineDiff } from './line-diff.js';
import { CodeLook } from './look.js';
import { MethodNames } from './method-names.js';
import { CodePainter } from './paint-line.js';
import { plugin } from '@mosetta/ide-api/client';

export { EDITOR_DEFAULTS, EDITOR_SCHEMA, type EditorSettings } from './settings.js';
export type { Chunk, CodeChunk } from './paint-line.js';
export type { Hunk, HunkKind, Step } from './line-diff.js';
export type { CodeViewProps } from './code-view.js';
export type { ThemeSource } from './look.js';
export { CodeLook, CodePainter, InputMechanics, Languages, LineDiff, MethodNames };

/**
 * How we show code — a plugin.
 *
 * Highlighting by extension, painting a line in pieces, a line-by-line diff, the input
 * mechanics and "show this file" are fields of the INSTANCE: a neighbour takes them
 * through `ide.getPlugin(CodePlugin)` rather than by import. The colours belong to the
 * theme: the look is assembled from its palette lazily, on first use, because the theme
 * is a neighbour rather than part of the code.
 */
@plugin({ title: 'plugin.code' })
export default class CodePlugin {
  readonly languages = new Languages(new MethodNames());
  readonly diff = new LineDiff();
  readonly input = new InputMechanics();
  readonly painter = new CodePainter(this.languages, () => this.look);
  /**
   * Show a file — a component on this instance: the look and the languages are already
   * supplied, so a neighbour needs no permit.
   */
  readonly View = (props: CodeViewProps) => <CodeView {...props} look={this.look} languages={this.languages} />;
  private built: CodeLook | null = null;

  constructor(private readonly ide: Ide) {}

  /**
   * The CodeMirror theme, the highlighting and the font rules — from the theme's
   * palette.
   */
  get look(): CodeLook {
    this.built ??= new CodeLook(this.ide.getPlugin(ThemePlugin));
    return this.built;
  }
}
