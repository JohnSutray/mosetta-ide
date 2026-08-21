import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const dc = {
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
} as const;

export const FONT = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

export const darculaTheme = EditorView.theme(
  {
    '&': {
      color: dc.fg,
      backgroundColor: dc.bg,
      height: '100%',
      fontSize: '13px',
    },
    '.cm-content': {
      fontFamily: FONT,
      lineHeight: '1.35',
      padding: '4px 0',
      caretColor: dc.caret,
    },
    '.cm-scroller': { fontFamily: FONT, overflow: 'auto' },

    '.cm-cursor, .cm-dropCursor': {
      borderLeft: `2px solid ${dc.caret}`,
      marginLeft: '-1px',
    },

    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      { backgroundColor: dc.selection },
    '.cm-activeLine': { backgroundColor: dc.curline },

    '.cm-gutters': {
      backgroundColor: dc.gutterBg,
      color: dc.gutterFg,
      border: 'none',
      fontFamily: FONT,
    },
    '.cm-activeLineGutter': { backgroundColor: dc.gutterBg, color: dc.gutterHl },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 12px' },

    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: dc.parenBg,
      color: dc.parenFg,
      fontWeight: 'bold',
    },
    '.cm-nonmatchingBracket': { color: '#FF6B68' },

    '.cm-panels': { backgroundColor: dc.treeBg, color: dc.fg },
    '.cm-searchMatch': { backgroundColor: '#32593D' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#155221' },
    '.cm-selectionMatch': { backgroundColor: '#33475B' },
  },
  { dark: true },
);

export const darculaHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword], color: dc.keyword },
  { tag: [t.bool, t.null, t.self, t.atom], color: dc.keyword },
  { tag: [t.string, t.special(t.string), t.regexp], color: dc.string },
  { tag: [t.number, t.integer, t.float], color: dc.number },
  { tag: [t.comment, t.lineComment, t.blockComment], color: dc.comment },
  { tag: t.docComment, color: dc.doc, fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: dc.func },
  { tag: t.definition(t.function(t.variableName)), color: dc.func },
  { tag: [t.typeName, t.className, t.namespace], color: dc.class },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: dc.const },
  { tag: t.constant(t.variableName), color: dc.const, fontStyle: 'italic' },
  { tag: [t.meta, t.annotation], color: dc.annot },
  { tag: [t.variableName, t.definition(t.variableName), t.labelName], color: dc.fg },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.derefOperator], color: dc.fg },
  { tag: [t.tagName], color: dc.keyword },
  { tag: [t.attributeName], color: dc.class },
  { tag: t.link, color: dc.number, textDecoration: 'underline' },
  { tag: t.heading, color: dc.fg, fontWeight: 'bold' },
  { tag: t.invalid, color: '#FF6B68' },
]);

export const darcula = [darculaTheme, syntaxHighlighting(darculaHighlight)];
