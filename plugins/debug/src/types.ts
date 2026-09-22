
/**
 * Where to take a stack frame's text from. Three cases, and all three are real — the
 * first simple script showed every one of them:
 *
 * - `project` — a project file, a protocol path (a key from the root);
 *
 * - `file` — a file on disk BEYOND the root: a global npm, `~/.nvm`;
 *
 * - `adapter` — there is no file at all (`<node_internals>/…`, a source from a map);
 * the text is handed over by the adapter with a `source` request by number.
 */
export type SourceRef =
  | { kind: 'project'; path: string }
  | { kind: 'file'; absolute: string }
  | { kind: 'adapter'; name: string; reference: number };

export interface Frame {
  id: number;
  name: string;
  source: SourceRef | null;
  /** From one, as in the editor. */
  line: number;
  column: number;
  /** The frame is somebody else's (Node's innards, a library): show it dimmed. */
  faint: boolean;
}

export interface Variable {
  name: string;
  value: string;
  type?: string;
  /** Greater than zero — it expands with a `variables` request carrying this number. */
  ref: number;
}

export interface Scope {
  name: string;
  ref: number;
  /** An expensive scope (the global one): expand it only on request. */
  expensive: boolean;
}

/**
 * What the user asked of the breakpoint: a condition, a hit count, a line for the log
 * instead of a stop (a logpoint). The adapter can do all of that; we only carry it.
 */
export interface BreakpointAsk {
  line: number;
  /** An expression: we stand only if it is true. */
  condition?: string;
  /** How many times to walk past: `3`, `>=3`, `%2`. */
  hitCondition?: string;
  /** Do not stand, print: `{sum} after {x}`. */
  logMessage?: string;
  /**
   * WHAT it stands on — the line's text without the indentation.
   *
   * A line number is an address, and anyone changes it: `git pull`, a formatter, a
   * neighbour on the branch. The text is what the user pointed a finger at. By it the
   * breakpoint finds itself again when the file has been re-read or opened in a new tab
   * (`Anchors`).
   *
   * Our own field; it does not travel to the adapter: DAP knows nothing of it.
   */
  anchor?: string;
}

export interface Breakpoint extends BreakpointAsk {
  verified: boolean;
  actual?: number;
  message?: string;
}

/** When to stand on exceptions. */
export type ExceptionMode = 'none' | 'uncaught' | 'all';

export interface FileBreakpoints {
  path: string;
  breakpoints: Breakpoint[];
}

export interface Stop {
  thread: number;
  reason: string;
  description?: string;
}

/**
 * An adapter session: one per PROCESS. The root is the run itself; `npm run dev` gives
 * three levels (run → npm → node).
 */
export interface SessionInfo {
  id: string;
  name: string;
  parent: string | null;
  /** Where the program lives: in Node or in the browser. */
  kind: 'node' | 'browser';
  state: 'starting' | 'running' | 'paused' | 'ended';
  stopped?: Stop;
}

export interface RunInfo {
  id: string;
  name: string;
  /**
   * `stopping` means we asked it to stop and the program is alive. "Stopped" and "asked
   * to stop" are different things, and lying about that is not allowed: in this state
   * the stop button becomes a SKULL.
   */
  state: 'starting' | 'running' | 'stopping' | 'ended';
  sessions: SessionInfo[];
  /** The address opened in the browser under the debugger, if one is open. */
  url?: string;
  /** Why the run failed or broke off — in the words of the adapter or of the OS. */
  error?: string;
}

/**
 * What to run. The paths are the protocol's (from the project's root): only the core
 * may expand them, with a check for going outside the root.
 */
export interface LaunchAsk {
  /** The name in the interface; without it, the program's name. */
  name?: string;
  /** A script for `node`. */
  program?: string;
  /** A page for the browser under the debugger — instead of a program. */
  url?: string;
  /** What to run with instead of `node`: `npm`, `pnpm`, a path to a binary. */
  runtime?: string;
  runtimeArgs?: string[];
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

export type Step = 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause';

/** What the program is saying: console, stdout, stderr — as the adapter named it. */
export interface Output {
  run: string;
  session: string;
  category: string;
  text: string;
}
