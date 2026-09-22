/**
 * The terminal's types — shared by both halves of the plugin.
 *
 * They used to lie in the protocol, and that meant the core carried the word "terminal"
 * around: `TerminalInfo` stood in the table of methods and `term.data` in the table of
 * events. Now they are known to exactly the two that need them, and a file shared by
 * two is the one place obliged to agree.
 *
 * That is also the price of moving out: the protocol no longer checks that the server
 * half sends what the client half expects. The compiler checks — because the file is
 * ONE rather than two identical ones.
 */

export type TerminalKind = 'manual' | 'script';

export interface TerminalInfo {
  /** A terminal's identity: for a script its id, for a manual one `manual-N`. */
  name: string;
  /** A short caption for the chip: `@mosetta/ide-server::dev` → `server::dev`. */
  title: string;
  kind: TerminalKind;
  pid: number;
  cols: number;
  rows: number;
  alive: boolean;
  /** The command it started with — the chip's tooltip shows it. */
  command?: string;
  /** The foreground process is not the shell: something is running in the terminal. */
  busy: boolean;
  /** Who exactly is running. Exists only while `busy`. */
  running?: string;
  /**
   * Busyness here is not "no" but "unknown". Windows has no process groups, and lying
   * with a brisk `busy: false` is not on.
   */
  busyUnknown?: string;
  exitCode?: number;
  createdAt: number;
}

/** What is needed in order to open a terminal by name. */
export interface OpenAsk {
  name: string;
  kind?: TerminalKind;
  /** A command to run right after the shell starts. */
  command?: string;
  /** The working directory RELATIVE to the project root. */
  cwd?: string;
  cols?: number;
  rows?: number;
}

/** The terminal's screen at the moment a tab connects. */
export interface Attached {
  info: TerminalInfo;
  buffer: string;
}

/** The events the server half sends to the tabs. */
export interface TerminalEvents {
  /** The list changed: one appeared, died, was closed, or became busy. */
  list: TerminalInfo[];
  /** A chunk of output. It flies to every tab of the project, and the client filters. */
  data: { name: string; data: string };
  exit: { name: string; exitCode: number };
}

/**
 * A shell found ON THIS MACHINE. The list is a hint rather than a limit: one's own path
 * can be written in by hand.
 */
export interface ShellInfo {
  path: string;
  name: string;
  /**
   * What to write into the settings on choosing this shell.
   *
   * Usually the name (`powershell`, `zsh`) — it is portable, and the settings file
   * travels between machines in git. A full path stays here only where it cannot be
   * shortened losslessly: on Windows, for instance, `bash` in PATH and `bash` from the
   * candidate list are different files.
   *
   * The client sends PRECISELY this rather than `path`: what a machine's path syntax is
   * and what lies in PATH is the server's knowledge.
   */
  ref: string;
  /** Terminals are being launched with it right now. */
  current: boolean;
}

/** What to open a terminal with, and with what environment. */
export interface ShellChoice {
  file: string;
  args: string[];
  /** The user's environment: PATH from their shell rather than from our process. */
  env: Record<string, string>;
  /** The chosen shell does not exist on this machine — we took the system's. */
  problem?: string;
}
