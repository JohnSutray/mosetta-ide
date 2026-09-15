import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tagHighlighter, tags as t, type Highlighter } from '@lezer/highlight';
import type { Palette } from '@mosetta/ide-plugin-theme';

export interface ThemeSource {
  readonly palette: Palette;
  readonly codeFont: string;
  readonly dark: boolean;
}

export class CodeLook {
  readonly palette: Palette;
  readonly font: string;
  readonly extension: Extension;
  readonly highlighter: Highlighter;

  constructor(theme: ThemeSource) {
    this.palette = theme.palette;
    this.font = theme.codeFont;
    const ink = this.ink(theme.palette);
    this.extension = [this.chrome(theme), syntaxHighlighting(HighlightStyle.define(ink))];
    this.highlighter = tagHighlighter(ink.map((item) => ({ tag: item.tag, class: item.color })));
  }

  textStyle(settings: { fontFamily: string; ligatures: boolean }) {
    const off = { fontVariantLigatures: 'none', fontFeatureSettings: "'calt' 0, 'liga' 0, 'dlig' 0" };
    const on = { fontVariantLigatures: 'normal', fontFeatureSettings: 'normal' };
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
