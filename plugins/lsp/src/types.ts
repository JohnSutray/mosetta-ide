
export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
  range: Range;
  severity: Severity;
  message: string;
  code?: string | number;
  source?: string;
}

export interface FileDiagnostics {
  path: string;
  diagnostics: Diagnostic[];
}

export type LspState = 'off' | 'starting' | 'ready' | 'failed';

export interface LspStatus {
  server: string;
  state: LspState;
  detail?: string;
  openDocs: number;
  sweep?: LspSweep;
}

export type SweepStop =
  | 'done'
  | 'budget'
  | 'baseline'
  | 'blind';

export interface LspSweep {
  checked: number;
  total: number;
  mb: number | null;
  baseMb: number | null;
  budgetMb: number;
  stopped: SweepStop | null;
}

export interface HoverInfo {
  markdown: string;
  range?: Range;
}

export interface SymbolSite {
  path: string;
  line: number;
  character: number;
  preview: string;
  isImport: boolean;
}

export type CompletionKind =
  | 'method'
  | 'function'
  | 'constructor'
  | 'field'
  | 'property'
  | 'variable'
  | 'constant'
  | 'class'
  | 'interface'
  | 'enum'
  | 'member'
  | 'module'
  | 'keyword'
  | 'snippet'
  | 'type'
  | 'file'
  | 'folder'
  | 'text'
  | 'other';

export interface CompletionEntry {
  label: string;
  kind: CompletionKind;
  insert: string;
  range?: Range;
  sortText: string;
  filterText?: string;
  detail?: string;
  imports?: boolean;
  deprecated?: boolean;
  raw: unknown;
}

export interface CompletionAnswer {
  items: CompletionEntry[];
  incomplete: boolean;
}

export interface TextEdit {
  range: Range;
  text: string;
}

export interface CompletionDetails {
  detail?: string;
  documentation?: string;
  edits: TextEdit[];
}

export interface TipsLike {
  show(target: Element, title: string, keys?: string[]): void;
  hide(): void;
}

export interface RevealLike {
  reveal(query: string): void;
}
