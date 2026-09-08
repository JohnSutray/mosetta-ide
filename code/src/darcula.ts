import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tagHighlighter, tags as t } from '@lezer/highlight';

export type Palette = typeof PALETTE;

const PALETTE = {
  fg: '#A9B7C6',
  bg: '#2B2B2B',
  keyword: '#CC7832',
  string: '#6A8759',
  number: '#6897BB',
  comment: '#808080',
  doc: '#629755',
  todo: '#A8C023',
  parenBg: '#3B514D',
  parenFg: '#FFEF28',
  treeBg: '#3C4041',
  iconDir: '#8A9296',
  const: '#9876AA',
  class: '#E8D9A0',
  func: '#FFC66D',
  annot: '#BBB529',
  curline: '#323232',
  selection: '#214283',
  treesel: '#2F5C8F',
  caret: '#FFFFFF',
  divider: '#4B4F51',
  gutterBg: '#313335',
  gutterFg: '#606366',
  gutterHl: '#A4A3A3',
  errorFg: '#FF6B68',
  warnFg: '#BE9117',
  tooltipBg: '#3B3E40',
} as const;

const FONT = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

function textStyle(settings: { fontFamily: string; ligatures: boolean }) {
  const off = { fontVariantLigatures: 'none', fontFeatureSettings: "'calt' 0, 'liga' 0, 'dlig' 0" };
  const on = { fontVariantLigatures: 'normal', fontFeatureSettings: 'normal' };
  return {
    fontFamily: `'${settings.fontFamily}', monospace`,
    ...(settings.ligatures ? on : off),
  };
}

const darculaTheme = EditorView.theme(
  {
    '&': {
      color: PALETTE.fg,
      backgroundColor: PALETTE.bg,
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content .cm-method-name, .cm-content .cm-method-name span': { color: PALETTE.func },
    '.cm-content': {
      fontFamily: FONT,
      lineHeight: '1.35',
      padding: '4px 0',
      caretColor: PALETTE.caret,
    },
    '.cm-scroller': { fontFamily: FONT, overflow: 'auto' },

    '.cm-cursor, .cm-dropCursor': {
      borderLeft: `2px solid ${PALETTE.caret}`,
      marginLeft: '-1px',
    },

    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: PALETTE.selection },
    '.cm-activeLine': { backgroundColor: PALETTE.curline },

    '.cm-gutters': {
      backgroundColor: PALETTE.gutterBg,
      color: PALETTE.gutterFg,
      border: 'none',
      fontFamily: FONT,
    },
    '.cm-activeLineGutter': { backgroundColor: PALETTE.gutterBg, color: PALETTE.gutterHl },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },

    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: PALETTE.parenBg,
      color: PALETTE.parenFg,
      fontWeight: 'bold',
    },
    '.cm-nonmatchingBracket': { color: '#FF6B68' },

    '.cm-panels': { backgroundColor: PALETTE.treeBg, color: PALETTE.fg },
    '.cm-searchMatch': { backgroundColor: '#32593D' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#155221' },
    '.cm-selectionMatch': { backgroundColor: '#33475B' },
  },
  { dark: true },
);

const INK = [
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: PALETTE.keyword },
  { tag: [t.bool, t.null, t.self, t.atom], color: PALETTE.keyword },
  { tag: [t.string, t.special(t.string), t.regexp], color: PALETTE.string },
  { tag: [t.number, t.integer, t.float], color: PALETTE.number },
  { tag: [t.comment, t.lineComment, t.blockComment], color: PALETTE.comment },
  { tag: t.docComment, color: PALETTE.doc, fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: PALETTE.func },
  { tag: t.definition(t.function(t.variableName)), color: PALETTE.func },
  { tag: [t.typeName, t.className, t.namespace], color: PALETTE.class },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: PALETTE.const },
  { tag: t.constant(t.variableName), color: PALETTE.const, fontStyle: 'italic' },
  { tag: [t.meta, t.annotation], color: PALETTE.annot },
  { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: PALETTE.fg },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator], color: PALETTE.fg },
  { tag: [t.tagName], color: PALETTE.keyword },
  { tag: [t.attributeName], color: PALETTE.class },
  { tag: t.link, color: PALETTE.number, textDecoration: 'underline' },
  { tag: t.heading, color: PALETTE.fg, fontWeight: 'bold' },
  { tag: t.invalid, color: '#FF6B68' },
];

const darculaHighlight = HighlightStyle.define(INK);

const inkHighlighter = tagHighlighter(
  INK.map((item) => ({ tag: item.tag, class: item.color })),
);

export class Darcula {
  readonly palette = PALETTE;
  readonly font = FONT;
  readonly extension = [darculaTheme, syntaxHighlighting(darculaHighlight)];
  readonly highlighter = inkHighlighter;

  textStyle(settings: { fontFamily: string; ligatures: boolean }) {
    return textStyle(settings);
  }
}

export const darcula = new Darcula();
