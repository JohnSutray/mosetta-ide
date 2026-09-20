import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tagHighlighter, tags as t, type Highlighter } from '@lezer/highlight';
import type { Palette } from '@mosetta/ide-plugin-theme';

/**
 * Where the look gets its colours: from the theme plugin. There is not one colour here:
 * Darcula is the theme's data, and assembling a CodeMirror theme and syntax
 * highlighting out of it is the mechanics of showing code.
 */
export interface ThemeSource {
  readonly palette: Palette;
  readonly codeFont: string;
  readonly dark: boolean;
}

/**
 * How code looks: the CodeMirror theme, the syntax highlighting and the font rules,
 * assembled from the theme's palette.
 *
 * The list of "which tag, which colour role" is ONE for two jobs: both the editor's
 * highlighting and the painting of single lines in lists are assembled from it. Having
 * drifted apart, they would look like two different schemes in one window.
 */
export class CodeLook {
  /** Colours by role: read by those who draw without CodeMirror's text too. */
  readonly palette: Palette;
  readonly font: string;
  /** The theme and the syntax highlighting in one piece — that is how it is plugged in. */
  readonly extension: Extension;
  /**
   * The same list, but handing over a COLOUR instead of a class name:
   * `HighlightStyle`'s classes live in a stylesheet CodeMirror mixes in when an editor
   * is mounted, and a line outside an editor has nothing to lean on there.
   */
  readonly highlighter: Highlighter;

  constructor(theme: ThemeSource) {
    this.palette = theme.palette;
    this.font = theme.codeFont;
    const ink = this.ink(theme.palette);
    this.extension = [this.chrome(theme), syntaxHighlighting(HighlightStyle.define(ink))];
    this.highlighter = tagHighlighter(ink.map((item) => ({ tag: item.tag, class: item.color })));
  }

  /**
   * The text's font rules, identical in every editor.
   *
   * Ligatures are switched off by TWO properties rather than one:
   * `font-variant-ligatures` removes the required and discretionary ones, while
   * contextual alternates (`calt`) live separately and are on by default. In JetBrains
   * Mono it is precisely those that change a character's shape according to its
   * neighbour. The ones that stay on are written EXPLICITLY: the theme kills ligatures
   * across the whole page body, and "setting nothing" would mean inheriting "off".
   */
  textStyle(settings: { fontFamily: string; ligatures: boolean }) {
    const off = { fontVariantLigatures: 'none !important', fontFeatureSettings: "'calt' 0, 'liga' 0, 'dlig' 0 !important" };
    const on = { fontVariantLigatures: 'normal !important', fontFeatureSettings: 'normal !important' };
    return {
      fontFamily: `'${settings.fontFamily}', monospace`,
      ...(settings.ligatures ? on : off),
    };
  }

  private chrome(theme: ThemeSource): Extension {
    const p = theme.palette;
    const font = theme.codeFont;
    return EditorView.theme(
      {
        '&': { color: p.fg, backgroundColor: p.bg, height: '100%', fontSize: '13px' },
        '.cm-content .cm-method-name, .cm-content .cm-method-name span': { color: p.func },
        '.cm-content': { fontFamily: font, lineHeight: '1.35', padding: '4px 0', caretColor: p.caret },
        '.cm-scroller': { fontFamily: font, overflow: 'auto' },
        '.cm-cursor, .cm-dropCursor': { borderLeft: `2px solid ${p.caret}`, marginLeft: '-1px' },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
          { backgroundColor: p.selection },
        '.cm-activeLine': { backgroundColor: p.curline },
        '.cm-gutters': { backgroundColor: p.gutterBg, color: p.gutterFg, border: 'none', fontFamily: font },
        '.cm-activeLineGutter': { backgroundColor: p.gutterBg, color: p.gutterHl },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },
        '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
          backgroundColor: p.parenBg,
          color: p.parenFg,
          fontWeight: 'bold',
        },
        '.cm-nonmatchingBracket': { color: p.errorFg },
        '.cm-panels': { backgroundColor: p.treeBg, color: p.fg },
        '.cm-searchMatch': { backgroundColor: p.searchMatch },
        '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: p.searchMatchSelected },
        '.cm-selectionMatch': { backgroundColor: p.selectionMatch },
      },
      { dark: theme.dark },
    );
  }

  /** Colours by the meaning of the code: which tag is painted with which palette role. */
  private ink(p: Palette) {
    return [
      { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: p.keyword },
      { tag: [t.bool, t.null, t.self, t.atom], color: p.keyword },
      { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
      { tag: [t.number, t.integer, t.float], color: p.number },
      { tag: [t.comment, t.lineComment, t.blockComment], color: p.comment },
      { tag: t.docComment, color: p.doc, fontStyle: 'italic' },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: p.func },
      { tag: t.definition(t.function(t.variableName)), color: p.func },
      { tag: [t.typeName, t.className, t.namespace], color: p.class },
      { tag: [t.propertyName, t.definition(t.propertyName)], color: p.const },
      { tag: t.constant(t.variableName), color: p.const, fontStyle: 'italic' },
      { tag: [t.meta, t.annotation], color: p.annot },
      { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: p.fg },
      { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator], color: p.fg },
      { tag: [t.tagName], color: p.keyword },
      { tag: [t.attributeName], color: p.class },
      { tag: t.link, color: p.number, textDecoration: 'underline' },
      { tag: t.heading, color: p.class, fontWeight: 'bold' },
      { tag: t.strong, color: p.fg, fontWeight: 'bold' },
      { tag: t.emphasis, color: p.fg, fontStyle: 'italic' },
      { tag: t.strikethrough, color: p.comment, textDecoration: 'line-through' },
      { tag: t.monospace, color: p.string },
      { tag: t.quote, color: p.comment, fontStyle: 'italic' },
      { tag: t.url, color: p.number, textDecoration: 'underline' },
      { tag: [t.processingInstruction, t.contentSeparator], color: p.keyword },
      { tag: t.list, color: p.keyword },
      { tag: t.invalid, color: p.errorFg },
    ];
  }
}
