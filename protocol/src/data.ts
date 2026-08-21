
export type WorkspaceId = string;

export interface WorkspaceInfo {
  id: WorkspaceId;
  root: string;
  name: string;
  sessions: number;
  held: string[];
  openedAt: number;
}

export type EntryKind = 'file' | 'dir';

export interface DirEntry {
  path: string;
  name: string;
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  symlink: boolean;
  noScan?: boolean;
}

export interface FileText {
  path: string;
  text: string;
  revision: string;
  truncated: boolean;
}

export interface WriteResult {
  path: string;
  revision: string;
}

export interface DocState {
  path: string;
  text: string;
  version: number;
  revision: string | null;
  dirty: boolean;
  truncated: boolean;
}

export interface DocVersion {
  path: string;
  version: number;
  dirty: boolean;
}

export type IndexKind = 'file' | 'npm' | 'ts';

export interface IndexHit {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  score: number;
  matches: number[];
}

export interface IndexStats {
  files: number;
  dirs: number;
  bytesResident: number;
  builtMs: number;
}

export interface SearchStats {
  files: number;
  scripts: number;
  symbols: number;
  vocabulary: number;
  pending: number;
}

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

export interface NpmScriptInfo {
  id: string;
  packageName: string;
  script: string;
  command: string;
  path: string;
}

export type TerminalKind = 'manual' | 'script';

export interface TerminalInfo {
  name: string;
  title: string;
  kind: TerminalKind;
  pid: number;
  cols: number;
  rows: number;
  alive: boolean;
  exitCode?: number;
  command?: string;
  createdAt: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
}
