
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
