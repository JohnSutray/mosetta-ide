import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Breakpoint, FileBreakpoints, Frame, Output, RunInfo, Scope, SourceRef, Variable } from './types.js';

export interface Paused {
  run: string;
  session: string;
  thread: number;
  reason: string;
  description?: string;
}

export interface OutputLine {
  run: string;
  category: string;
  text: string;
}

export interface Foreign {
  run: string;
  session: string;
  source: Exclude<SourceRef, { kind: 'project' }>;
  line: number;
}

export interface VarNode {
  name: string;
  value: string;
  type?: string;
  ref: number;
  children: VarNode[] | null;
  open: boolean;
  expensive?: boolean;
}

const OUTPUT_LINES = 500;

const NOISE = /^Could not read source map for /;

export class DebugState {
  readonly runs = signal<RunInfo[]>([]);
  readonly breakpoints = signal<Map<string, Breakpoint[]>>(new Map());
  readonly paused = signal<Paused | null>(null);
  readonly frames = signal<Frame[]>([]);
  readonly frameAt = signal(0);
  readonly scopes = signal<VarNode[]>([]);
  readonly output = signal<OutputLine[]>([]);
  readonly hiddenNoise = signal(0);
  readonly foreign = new Map<string, Foreign>();

  readonly live: ReadonlySignal<RunInfo[]> = computed(() => this.runs.value.filter((run) => run.state !== 'ended'));
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

  addOutput(one: Output): void {
    if (one.category === 'telemetry') return;
    if (NOISE.test(one.text)) {
      this.hiddenNoise.value += 1;
      return;
    }
    const next = [...this.output.value, { run: one.run, category: one.category, text: one.text }];
    this.output.value = next.length > OUTPUT_LINES ? next.slice(-OUTPUT_LINES) : next;
  }

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
    });
    this.foreign.clear();
  }
}

function replace(list: VarNode[], target: VarNode, next: VarNode): VarNode[] {
  return list.map((node) => {
    if (node === target) return next;
    if (!node.children) return node;
    const children = replace(node.children, target, next);
    return children === node.children ? node : { ...node, children };
  });
}
