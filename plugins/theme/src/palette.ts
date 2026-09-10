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

export const CODE_FONT = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
