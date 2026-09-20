/**
 * The data both ends exchange.
 *
 * Path rule: no path in the protocol is absolute. Everything is relative to
 * the workspace root, the separator is always `/`, and the root itself is the
 * empty string. The single exception is `workspace.open`, where an absolute
 * path is the subject of the call. As a result the front end never learns
 * which OS it is talking to, and the escape check lives in one place on the
 * server.
 */

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
  /** The directory is listed in `fs.noScan`: shown, but never walked eagerly. */
  noScan?: boolean;
}

export interface FileText {
  path: string;
  text: string;
  /** Version stamp of the file ON DISK (`mtime:size`). */
  revision: string;
  truncated: boolean;
}

export interface WriteResult {
  path: string;
  revision: string;
}

/**
 * A document in the RAM filesystem. `version` counts edits made in memory;
 * `revision` is the disk stamp those edits started from. Two separate numbers
 * on purpose: one describes our layer, the other the one below it.
 */
export interface DocState {
  path: string;
  text: string;
  version: number;
  revision: string | null;
  dirty: boolean;
  /** The file is over the size limit: we show the head and refuse edits. */
  truncated: boolean;
  /**
   * Disk moved away while memory still holds unsaved edits.
   *
   * A state rather than an event: an event survives exactly one tab and one
   * render, so after a page reload the text from memory would be shown without
   * a word about disk holding something else.
   */
  diverged?: 'changed' | 'removed';
}

/** Reply to an edit. The text is not echoed back — the client already has it. */
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
  /** `@distrojs/core::dev` — also the name of the terminal the script lives in. */
  id: string;
  packageName: string;
  script: string;
  /** The command as written in package.json. */
  command: string;
  /** The package.json that declares it. */
  path: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
}
