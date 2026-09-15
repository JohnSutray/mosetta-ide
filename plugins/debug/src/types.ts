
export type SourceRef =
  | { kind: 'project'; path: string }
  | { kind: 'file'; absolute: string }
  | { kind: 'adapter'; name: string; reference: number };

export interface Frame {
  id: number;
  name: string;
  source: SourceRef | null;
  line: number;
  column: number;
  faint: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  ref: number;
}

export interface Scope {
  name: string;
  ref: number;
  expensive: boolean;
}

export interface Breakpoint {
  line: number;
  verified: boolean;
  actual?: number;
  message?: string;
}

export interface FileBreakpoints {
  path: string;
  breakpoints: Breakpoint[];
}

export interface Stop {
  thread: number;
  reason: string;
  description?: string;
}

export interface SessionInfo {
  id: string;
  name: string;
  parent: string | null;
  state: 'starting' | 'running' | 'paused' | 'ended';
  stopped?: Stop;
}

export interface RunInfo {
  id: string;
  name: string;
  state: 'starting' | 'running' | 'ended';
  sessions: SessionInfo[];
  error?: string;
}

export interface LaunchAsk {
  name?: string;
  program?: string;
  runtime?: string;
  runtimeArgs?: string[];
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export type Step = 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause';

export interface Output {
  run: string;
  session: string;
  category: string;
  text: string;
}
