
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

export interface IndexStats {
  files: number;
  dirs: number;
  bytesResident: number;
  builtMs: number;
}

export interface NpmScriptInfo {
  id: string;
  packageName: string;
  script: string;
  command: string;
  path: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
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
