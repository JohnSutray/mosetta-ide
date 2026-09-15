import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Logger, Project, ProjectResource } from '@mosetta/ide-api/server';
import type { JsDebugAdapter } from './adapter.js';
import { DebugRun, type RunOwner } from './run.js';
import type { DapSession, TerminalAsk } from './session.js';
import { shellLine } from './shell-line.js';
import { Sources, type DapFrame, type DapSource } from './sources.js';
import type {
  Breakpoint,
  FileBreakpoints,
  Frame,
  LaunchAsk,
  RunInfo,
  Scope,
  Step,
  Stop,
  Variable,
} from './types.js';

export type DebugProject = Pick<Project, 'root' | 'resolve' | 'emit' | 'hold' | 'start'>;

export interface TerminalAskOut {
  name: string;
  cwd: string;
  command: string;
  env: Record<string, string>;
  sameShell: string;
}

export type TerminalRunner = ((ask: TerminalAskOut) => { pid: number }) | null;

export class DebugHost implements ProjectResource, RunOwner {
  private readonly lines = new Map<string, number[]>();
  private readonly runs = new Map<string, DebugRun>();
  private readonly holds = new Map<string, () => void>();
  private readonly sources: Sources;
  private readonly foreign = new Set<string>();
  private next = 1;

  constructor(
    private readonly project: DebugProject,
    private readonly adapter: JsDebugAdapter,
    private readonly log: Logger,
    private readonly terminalRunner: TerminalRunner = null,
    private readonly readDisk: (absolute: string) => Promise<string> = (absolute) => readFile(absolute, 'utf8'),
  ) {
    this.sources = new Sources(project.root, (relative) => project.resolve(relative));
  }

  async setBreakpoints(path: string, lines: number[]): Promise<FileBreakpoints> {
    this.project.resolve(path);
    const clean = [...new Set(lines.filter((line) => Number.isInteger(line) && line > 0))].sort((a, b) => a - b);
    if (clean.length === 0) this.lines.delete(path);
    else this.lines.set(path, clean);
    await Promise.all(
      this.liveSessions().map((session) =>
        session.sync(path).catch((err) => this.log.warn(`debug: breakpoints not sent to ${session.name}: ${String(err)}`)),
      ),
    );
    const state = this.breakpointsOf(path);
    this.project.emit('breakpoints', state);
    return state;
  }

  breakpointsOf(path: string): FileBreakpoints {
    const sessions = this.liveSessions();
    const breakpoints = (this.lines.get(path) ?? []).map((line): Breakpoint => {
      const answers = sessions.flatMap((session) => session.placedIn(path).filter((one) => one.line === line));
      const verified = answers.find((one) => one.verified);
      if (verified) return { ...verified };
      const told = answers.find((one) => one.message);
      return { line, verified: false, ...(told?.message ? { message: told.message } : {}) };
    });
    return { path, breakpoints };
  }

  allBreakpoints(): FileBreakpoints[] {
    return [...this.lines.keys()].sort().map((path) => this.breakpointsOf(path));
  }

  async launch(ask: LaunchAsk): Promise<RunInfo> {
    if (!ask.program && !ask.runtime) throw new Error('launch needs program or runtime');
    if (ask.program && !existsSync(this.project.resolve(ask.program))) {
      throw new Error(`program not found: ${ask.program}`);
    }
    const name = ask.name ?? ask.program ?? ask.runtime ?? 'debug';
    for (const run of this.runs.values()) {
      if (run.name === name && run.state === 'ended') this.runs.delete(run.id);
    }

    const id = String(this.next++);
    const adapter = await this.adapter.open((spec) => this.project.start(spec), `debug adapter: ${name}`);
    const run = new DebugRun(id, name, adapter, this);
    this.runs.set(id, run);
    this.holds.set(id, this.project.hold(`debug ${name}`));
    this.log.info(`debug: ${name} started`);
    await run.begin(this.configuration(name, ask));
    return run.info();
  }

  list(): RunInfo[] {
    return [...this.runs.values()].map((run) => run.info());
  }

  async stop(runId: string): Promise<void> {
    await this.run(runId).stop();
  }

  async step(runId: string, sessionId: string, thread: number, step: Step): Promise<void> {
    const session = this.run(runId).session(sessionId);
    await session.request(step, { threadId: thread });
    if (step !== 'pause') session.resumed();
  }

  async stack(runId: string, sessionId: string, thread: number): Promise<Frame[]> {
    const answer = await this.run(runId)
      .session(sessionId)
      .request<{ stackFrames: DapFrame[] }>('stackTrace', { threadId: thread });
    const frames = answer.stackFrames.map((frame) => this.sources.frame(frame));
    for (const frame of frames) {
      if (frame.source?.kind === 'file') this.foreign.add(frame.source.absolute);
    }
    return frames;
  }

  async readForeign(absolute: string): Promise<{ text: string }> {
    if (!this.foreign.has(absolute)) throw new Error(`not a debugger source: ${absolute}`);
    return { text: await this.readDisk(absolute) };
  }

  async scopes(runId: string, sessionId: string, frame: number): Promise<Scope[]> {
    const answer = await this.run(runId)
      .session(sessionId)
      .request<{ scopes: Array<{ name: string; variablesReference: number; expensive?: boolean }> }>('scopes', {
        frameId: frame,
      });
    return answer.scopes.map((scope) => ({
      name: scope.name,
      ref: scope.variablesReference,
      expensive: scope.expensive ?? false,
    }));
  }

  async variables(runId: string, sessionId: string, ref: number): Promise<Variable[]> {
    const answer = await this.run(runId)
      .session(sessionId)
      .request<{ variables: Array<{ name: string; value: string; type?: string; variablesReference: number }> }>(
        'variables',
        { variablesReference: ref },
      );
    return answer.variables.map((one) => ({
      name: one.name,
      value: one.value,
      ...(one.type ? { type: one.type } : {}),
      ref: one.variablesReference,
    }));
  }

  async evaluate(
    runId: string,
    sessionId: string,
    expression: string,
    frame: number | undefined,
    context: 'hover' | 'watch' | 'repl',
  ): Promise<Variable> {
    const answer = await this.run(runId)
      .session(sessionId)
      .request<{ result: string; type?: string; variablesReference: number }>('evaluate', {
        expression,
        context,
        ...(frame !== undefined ? { frameId: frame } : {}),
      });
    return {
      name: expression,
      value: answer.result,
      ...(answer.type ? { type: answer.type } : {}),
      ref: answer.variablesReference,
    };
  }

  async source(runId: string, sessionId: string, reference: number): Promise<{ text: string; mime?: string }> {
    const source: DapSource = { sourceReference: reference };
    const answer = await this.run(runId)
      .session(sessionId)
      .request<{ content: string; mimeType?: string }>('source', { source, sourceReference: reference });
    return { text: answer.content, ...(answer.mimeType ? { mime: answer.mimeType } : {}) };
  }

  dispose(): void {
    for (const run of this.runs.values()) void run.stop();
    this.runs.clear();
    for (const release of this.holds.values()) release();
    this.holds.clear();
  }

  breakpoints(): ReadonlyMap<string, readonly number[]> {
    return this.lines;
  }

  toAdapter(key: string): string {
    return this.sources.toAdapter(key);
  }

  hasTerminal(): boolean {
    return this.terminalRunner !== null;
  }

  async terminal(run: DebugRun, ask: TerminalAsk): Promise<{ shellProcessId?: number; processId?: number }> {
    if (!this.terminalRunner) throw new Error('no terminal in this build');
    let pid: number;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(ask.env ?? {})) if (typeof value === 'string') env[key] = value;
    try {
      pid = this.terminalRunner({
        name: `debug::${run.name}`,
        cwd: ask.cwd || this.project.root,
        command: shellLine.compose(ask.args),
        env,
        sameShell: shellLine.compose(ask.args, env),
      }).pid;
    } catch (err) {
      this.log.warn(`debug: terminal refused ${run.name}: ${String(err)}`);
      throw err;
    }
    this.project.emit('terminal', { run: run.id, name: `debug::${run.name}` });
    return { shellProcessId: pid };
  }

  changed(run: DebugRun): void {
    if (run.state === 'ended') {
      this.holds.get(run.id)?.();
      this.holds.delete(run.id);
    }
    this.project.emit('runs', this.list());
  }

  stopped(run: DebugRun, session: DapSession, stop: Stop): void {
    this.project.emit('stopped', { run: run.id, session: session.id, stop });
  }

  output(run: DebugRun, session: DapSession, category: string, text: string): void {
    this.project.emit('output', { run: run.id, session: session.id, category, text });
  }

  verified(_run: DebugRun, key: string): void {
    this.project.emit('breakpoints', this.breakpointsOf(key));
  }

  private run(id: string): DebugRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`no debug run ${id}`);
    return run;
  }

  private liveSessions(): DapSession[] {
    return [...this.runs.values()]
      .filter((run) => run.state !== 'ended')
      .flatMap((run) => run.all())
      .filter((session) => session.state !== 'ended');
  }

  private configuration(name: string, ask: LaunchAsk): Record<string, unknown> {
    const root = this.project.root;
    return {
      type: 'pwa-node',
      request: 'launch',
      name,
      ...(ask.program ? { program: this.project.resolve(ask.program) } : {}),
      ...(ask.runtime ? { runtimeExecutable: ask.runtime } : {}),
      ...(ask.runtimeArgs ? { runtimeArgs: ask.runtimeArgs } : {}),
      ...(ask.args ? { args: ask.args } : {}),
      cwd: ask.cwd ? this.project.resolve(ask.cwd) : root,
      env: { ...(ask.env ?? {}), ELECTRON_RUN_AS_NODE: null },
      console: this.hasTerminal() ? 'integratedTerminal' : 'internalConsole',
      outputCapture: 'std',
      __workspaceFolder: root,
    };
  }
}
