import type { Ide } from '@ide/api/client';
import ThemePlugin from '@ide/plugin-theme';
import { CodeView, type CodeViewProps } from './code-view.js';
import { InputMechanics } from './input-keymap.js';
import { Languages } from './languages.js';
import { LineDiff } from './line-diff.js';
import { CodeLook } from './look.js';
import { MethodNames } from './method-names.js';
import { CodePainter } from './paint-line.js';

export { EDITOR_DEFAULTS, type EditorSettings } from './settings.js';
export type { Chunk, CodeChunk } from './paint-line.js';
export type { Hunk, HunkKind, Step } from './line-diff.js';
export type { CodeViewProps } from './code-view.js';
export type { ThemeSource } from './look.js';
export { CodeLook, CodePainter, InputMechanics, Languages, LineDiff, MethodNames };

export default class CodePlugin {
  readonly languages = new Languages(new MethodNames());
  readonly diff = new LineDiff();
  readonly input = new InputMechanics();
  readonly painter = new CodePainter(this.languages, () => this.look);
  readonly View = (props: CodeViewProps) => <CodeView {...props} look={this.look} languages={this.languages} />;
  private built: CodeLook | null = null;

  constructor(private readonly ide: Ide) {}

  get look(): CodeLook {
    this.built ??= new CodeLook(this.ide.getPlugin(ThemePlugin));
    return this.built;
  }
}
