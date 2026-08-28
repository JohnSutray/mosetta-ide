
export type WorkspaceId = string;

export interface WorkspaceInfo {
  id: WorkspaceId;
  root: string;
  name: string;
  sessions: number;
  held: string[];
  openedAt: number;
}

export interface DirSuggestion {
  path: string;
  name: string;
  children?: DirSuggestion[];
}

export interface SymbolSite {
  path: string;
  line: number;
  character: number;
  preview: string;
  isImport: boolean;
}

export interface Visit {
  path: string;
  line: number;
  character?: number;
}

export interface ShellInfo {
  path: string;
  name: string;
  ref: string;
  current: boolean;
}

export interface PackageManagerInfo {
  path: string;
  name: string;
  version: string;
  suggested: boolean;
  current: boolean;
}

export interface RecentProject {
  root: string;
  name: string;
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

export type IndexKind = string;

export const CORE_KINDS = ['file', 'ts'] as const;

export interface IndexHit {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  id?: string;
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
  provided: number;
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
  busy: boolean;
  running?: string;
  busyUnknown?: string;
  createdAt: number;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
}

export type GitFileState = 'modified' | 'added' | 'untracked' | 'deleted' | 'conflict';

export interface GitState {
  repo: boolean;
  branch: string | null;
  ahead: number;
  behind: number;
  files: Record<string, GitFileState>;
  error?: string;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  head: string;
  subject?: string;
}

export type GitAction =
  | 'checkout'
  | 'create'
  | 'rename'
  | 'delete'
  | 'force-delete'
  | 'push'
  | 'force-push'
  | 'pull'
  | 'fetch'
  | 'merge';

export interface GitChange {
  path: string;
  state: GitFileState;
}

export interface GitCommit {
  short: string;
  subject: string;
  body?: string;
  author: string;
  date: string;
}

export interface PushPreview {
  branch: string | null;
  upstream: string | null;
  common: GitCommit[];
  remote: GitCommit[];
  local: GitCommit[];
}

export type MergeSource = 'fs' | 'git' | 'shelve';

export interface MergeSide {
  label: string;
  text: string | null;
}

export interface MergeFile {
  path: string;
  base: string | null;
  left: MergeSide;
  right: MergeSide;
  done: boolean;
}

export interface MergeSession {
  id: string;
  source: MergeSource;
  title: string;
  files: MergeFile[];
}
