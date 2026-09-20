/**
 * The palette BY ROLE: what is painted in which colour, without a single piece of
 * knowledge about CodeMirror. It is read by the code display (which assembles the
 * editor theme and the highlighting), by the terminal, and by everyone who draws
 * without styles. A second theme is a second table like this one rather than an edit in
 * six places.
 */
export interface Palette {
  fg: string;
  bg: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  doc: string;
  todo: string;
  parenBg: string;
  parenFg: string;
  treeBg: string;
  iconDir: string;
  const: string;
  class: string;
  func: string;
  annot: string;
  curline: string;
  selection: string;
  treesel: string;
  caret: string;
  divider: string;
  gutterBg: string;
  gutterFg: string;
  gutterHl: string;
  errorFg: string;
  warnFg: string;
  tooltipBg: string;
  searchMatch: string;
  searchMatchSelected: string;
  selectionMatch: string;
}

/**
 * Darcula as in WebStorm. The values were not picked by eye but carried over from an
 * earlier config, into which they had gone straight from JetBrains' own scheme: an
 * eyedropper on a screenshot lies, because of anti-aliasing.
 */
export const DARCULA: Palette = {
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
  searchMatch: '#32593D',
  searchMatchSelected: '#155221',
  selectionMatch: '#33475B',
};

/**
 * What code is set in. The TAIL of the chain is about three systems rather than one.
 *
 * Until recently, our `JetBrains Mono` was followed only by the Mac's `SF Mono` and
 * `Menlo`. On Linux none of the three exists, and the chain fell through to the generic
 * `monospace` — that is, to whatever font the browser was given by default, usually
 * narrow and not ours. Verified on that machine: not one name from the chain turned up
 * in `fc-list`.
 *
 * The generic `monospace` stays last: it always exists, and falling there is no
 * disgrace — the disgrace is falling there AT ONCE.
 */
export const CODE_FONT = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace";
