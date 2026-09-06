
export type TerminalKind = 'manual' | 'script';

export interface TerminalInfo {
  name: string;
  title: string;
  kind: TerminalKind;
  pid: number;
  cols: number;
  rows: number;
  alive: boolean;
  command?: string;
  busy: boolean;
  running?: string;
  busyUnknown?: string;
  exitCode?: number;
  createdAt: number;
}

export interface OpenAsk {
  name: string;
  kind?: TerminalKind;
  command?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

export interface Attached {
  info: TerminalInfo;
  buffer: string;
}

export interface TerminalEvents {
  list: TerminalInfo[];
  data: { name: string; data: string };
  exit: { name: string; exitCode: number };
}

export interface ShellInfo {
  path: string;
  name: string;
  ref: string;
  current: boolean;
}

export interface ShellChoice {
  file: string;
  args: string[];
  env: Record<string, string>;
  problem?: string;
}
