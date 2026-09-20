import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Breakpoint, BreakpointAsk, ExceptionMode, FileBreakpoints, Frame, Output, RunInfo, Scope, SourceRef, Variable } from './types.js';

/** Where we are standing: the run, the session, the thread and why we stopped. */
export interface Paused {
  run: string;
  session: string;
  thread: number;
  reason: string;
  description?: string;
}

/** A line of the program's output — as it arrived, with its category. */
export interface OutputLine {
  run: string;
  category: string;
  text: string;
}

/**
 * A source beyond the root that we show under a name of our own: `debug:<name>` in the
 * editor's panel, and the text comes from this entry.
 */
export interface Foreign {
  run: string;
  session: string;
  source: Exclude<SourceRef, { kind: 'project' }>;
  /** The frame's line, the one we showed it for, from one. */
  line: number;
}

/** A node of the variables tree: a scope or a value with children. */
export interface VarNode {
  name: string;
  value: string;
  type?: string;
  ref: number;
  /**
   * `null` means we have not asked yet; a list means we have asked, even if it is
   * empty.
   */
  children: VarNode[] | null;
  open: boolean;
  /** An expensive scope (the global one): do not expand it until asked. */
  expensive?: boolean;
}

/** A watched expression, and what it means right now. */
export interface Watch {
  expression: string;
  value: string | null;
  /** It did not evaluate: the adapter's error text. */
  error?: string;
}

/** A breakpoint's edit window: which line of which file, and what was in it. */
export interface BreakpointEdit {
  path: string;
  ask: BreakpointAsk;
  at: { x: number; y: number };
}

/** How many lines of output we keep: the rest is already in the terminal or in the past. */
const OUTPUT_LINES = 500;

/**
 * The adapter's noise about npm's own source maps: about ten lines per run, all about
 * files the human never wrote. We hide them, but we COUNT them — a silent truncation is
 * worse than noise.
 */
const NOISE = /^Could not read source map for /;

/**
 * The state of debugging in the tab. The truth is on the server; here is what it said
 * with events, and what the human chose with their eyes: which frame we are looking at,
 * what they expanded in the variables.
 */
export class DebugState {
  readonly runs = signal<RunInfo[]>([]);
  readonly breakpoints = signal<Map<string, Breakpoint[]>>(new Map());
  readonly paused = signal<Paused | null>(null);
  readonly frames = signal<Frame[]>([]);
  readonly frameAt = signal(0);
  readonly scopes = signal<VarNode[]>([]);
  readonly output = signal<OutputLine[]>([]);
  readonly hiddenNoise = signal(0);
  readonly watches = signal<Watch[]>([]);
  readonly exceptions = signal<ExceptionMode>('none');
  /** A breakpoint's menu on the right button: where, and on which line. */
  readonly menu = signal<{ path: string; line: number; at: { x: number; y: number } } | null>(null);
  readonly edit = signal<BreakpointEdit | null>(null);
  /**
   * The sources beyond the root, by the name of the view. Not a signal: the view reads
   * them by key.
   */
  readonly foreign = new Map<string, Foreign>();

  readonly live: ReadonlySignal<RunInfo[]> = computed(() => this.runs.value.filter((run) => run.state !== 'ended'));
  /**
   * The runs that were ASKED to stop and did not obey. While there are any, a new run
   * is not begun, and the stop button is a skull.
   */
  readonly stuck: ReadonlySignal<RunInfo[]> = computed(() => this.runs.value.filter((run) => run.state === 'stopping'));
  readonly frame: ReadonlySignal<Frame | null> = computed(() => this.frames.value[this.frameAt.value] ?? null);

  setRuns(list: RunInfo[]): void {
    batch(() => {
      this.runs.value = list;
      const paused = this.paused.value;
      if (paused && !list.some((run) => run.id === paused.run && run.state !== 'ended')) this.resumed(paused.run);
    });
  }

  stopped(paused: Paused): void {
    batch(() => {
      this.paused.value = paused;
      this.frames.value = [];
      this.frameAt.value = 0;
      this.scopes.value = [];
    });
  }

  /** The program has gone on: there is no stop any more, nor a stack. */
  resumed(run: string, session?: string): void {
    const paused = this.paused.value;
    if (!paused || paused.run !== run || (session !== undefined && paused.session !== session)) return;
    batch(() => {
      this.paused.value = null;
      this.frames.value = [];
      this.frameAt.value = 0;
      this.scopes.value = [];
    });
  }

  setFrames(frames: Frame[]): void {
    batch(() => {
      this.frames.value = frames;
      this.frameAt.value = 0;
    });
  }

  setScopes(scopes: Scope[]): void {
    this.scopes.value = scopes.map((scope) => ({
      name: scope.name,
      value: '',
      ref: scope.ref,
      children: null,
      open: false,
      expensive: scope.expensive,
    }));
  }

  /**
   * Expand a node with the children the server brought. The node is looked up by
   * reference.
   */
  fill(node: VarNode, children: Variable[]): void {
    this.scopes.value = replace(this.scopes.value, node, {
      ...node,
      open: true,
      children: children.map((one) => ({
        name: one.name,
        value: one.value,
        ...(one.type ? { type: one.type } : {}),
        ref: one.ref,
        children: null,
        open: false,
      })),
    });
  }

  toggle(node: VarNode): void {
    this.scopes.value = replace(this.scopes.value, node, { ...node, open: !node.open });
  }

  setBreakpoints(file: FileBreakpoints): void {
    const next = new Map(this.breakpoints.value);
    if (file.breakpoints.length === 0) next.delete(file.path);
    else next.set(file.path, file.breakpoints);
    this.breakpoints.value = next;
  }

  setAllBreakpoints(files: FileBreakpoints[]): void {
    this.breakpoints.value = new Map(files.filter((one) => one.breakpoints.length > 0).map((one) => [one.path, one.breakpoints]));
  }

  linesOf(path: string): number[] {
    return (this.breakpoints.value.get(path) ?? []).map((one) => one.line);
  }

  /** The request standing on this line, if there is one. */
  askAt(path: string, line: number): BreakpointAsk | null {
    const found = (this.breakpoints.value.get(path) ?? []).find((one) => one.line === line);
    if (!found) return null;
    const { condition, hitCondition, logMessage, anchor } = found;
    return {
      line,
      ...(anchor ? { anchor } : {}),
      ...(condition ? { condition } : {}),
      ...(hitCondition ? { hitCondition } : {}),
      ...(logMessage ? { logMessage } : {}),
    };
  }

  /** The edit window's draft: the field has changed — the request has changed. */
  draft(patch: Partial<BreakpointAsk>): void {
    const edit = this.edit.value;
    if (edit) this.edit.value = { ...edit, ask: { ...edit.ask, ...patch } };
  }

  setWatchValue(expression: string, value: string | null, error?: string): void {
    this.watches.value = this.watches.value.map((one) =>
      one.expression === expression ? { expression, value, ...(error ? { error } : {}) } : one,
    );
  }

  addOutput(one: Output): void {
    if (one.category === 'telemetry') return;
    if (NOISE.test(one.text)) {
      this.hiddenNoise.value += 1;
      return;
    }
    const next = [...this.output.value, { run: one.run, category: one.category, text: one.text }];
    this.output.value = next.length > OUTPUT_LINES ? next.slice(-OUTPUT_LINES) : next;
  }

  /** The project has changed — everything about the old one is about nothing now. */
  reset(): void {
    batch(() => {
      this.runs.value = [];
      this.breakpoints.value = new Map();
      this.paused.value = null;
      this.frames.value = [];
      this.frameAt.value = 0;
      this.scopes.value = [];
      this.output.value = [];
      this.hiddenNoise.value = 0;
      this.watches.value = [];
      this.exceptions.value = 'none';
      this.menu.value = null;
      this.edit.value = null;
    });
    this.foreign.clear();
  }
}

/** A new tree with one node replaced: signals like new objects. */
function replace(list: VarNode[], target: VarNode, next: VarNode): VarNode[] {
  return list.map((node) => {
    if (node === target) return next;
    if (!node.children) return node;
    const children = replace(node.children, target, next);
    return children === node.children ? node : { ...node, children };
  });
}
