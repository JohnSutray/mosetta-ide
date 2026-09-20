import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Logger, Project, ProjectResource } from '@mosetta/ide-api/server';
import type { JsDebugAdapter } from './adapter.js';
import { ServerReady } from './ready.js';
import { DebugRun, type RunOwner } from './run.js';
import type { DapSession, TerminalAsk } from './session.js';
import { DEBUG_DEFAULTS, type DebugSettings } from './settings.js';
import { shellLine } from './shell-line.js';
import { Sources, type DapFrame, type DapSource } from './sources.js';
import type {
  Breakpoint,
  BreakpointAsk,
  ExceptionMode,
  FileBreakpoints,
  Frame,
  LaunchAsk,
  RunInfo,
  Scope,
  Step,
  Stop,
  Variable,
} from './types.js';

const SKIP_FILES = ['<node_internals>/**', 'about://React/**'];

export type DebugProject = Pick<Project, 'root' | 'resolve' | 'emit' | 'hold' | 'start'>;

export interface TerminalAskOut {
  name: string;
  cwd: string;
  command: string;
  env: Record<string, string>;
  sameShell: string;
}

export interface TerminalRun {
  pid: number;
  watch: (listener: (data: string) => void) => () => void;
}

export type TerminalRunner = ((ask: TerminalAskOut) => TerminalRun) | null;

const SETTLE_MS = 150;
const SETTLE_TRIES = 8;

export class DebugHost implements ProjectResource, RunOwner {
  private readonly lines = new Map<string, BreakpointAsk[]>();
  private exceptionMode: ExceptionMode = 'none';
  private readonly runs = new Map<string, DebugRun>();
  private readonly holds = new Map<string, () => void>();
  private readonly sources: Sources;
  private readonly foreign = new Set<string>();
  private readonly ready = new Map<string, { watcher: ServerReady; off: () => void }>();
  private next = 1;

  constructor(
    private readonly project: DebugProject,
    private readonly adapter: JsDebugAdapter,
    private readonly log: Logger,
    private readonly terminalRunner: TerminalRunner = null,
    private readonly readDisk: (absolute: string) => Promise<string> = (absolute) => readFile(absolute, 'utf8'),
    private readonly settings: () => DebugSettings = () => DEBUG_DEFAULTS,
    private readonly terminalRunning: ((name: string) => { pid: number | undefined } | null) | null = null,
    private readonly killTree: (pid: number, options?: { self?: boolean }) => Promise<number> = async () => 0,
  ) {
    this.sources = new Sources(project.root, (relative) => project.resolve(relative));
  }

  async setBreakpoints(path: string, asks: BreakpointAsk[]): Promise<FileBreakpoints> {
    this.project.resolve(path);
    const seen = new Set<number>();
    const clean: BreakpointAsk[] = [];
    for (const ask of [...asks].sort((a, b) => a.line - b.line)) {
      if (!Number.isInteger(ask.line) || ask.line < 1 || seen.has(ask.line)) continue;
      seen.add(ask.line);
      clean.push(trimAsk(ask));
    }
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
    const breakpoints = (this.lines.get(path) ?? []).map((ask): Breakpoint => {
      const answers = sessions.flatMap((session) => session.placedIn(path).filter((one) => one.line === ask.line));
      const verified = answers.find((one) => one.verified);
      if (verified) return { ...verified, ...ask };
      const told = answers.find((one) => one.message);
      return { ...ask, verified: false, ...(told?.message ? { message: told.message } : {}) };
    });
    return { path, breakpoints };
  }

  exceptions(): ExceptionMode {
    return this.exceptionMode;
  }

  async setExceptions(mode: ExceptionMode): Promise<ExceptionMode> {
    this.exceptionMode = mode;
    await Promise.all(
      this.liveSessions().map((session) =>
        session.syncExceptions().catch((err) => this.log.warn(`debug: exception mode not sent to ${session.name}: ${String(err)}`)),
      ),
    );
    this.project.emit('exceptions', mode);
    return mode;
  }

  allBreakpoints(): FileBreakpoints[] {
    return [...this.lines.keys()].sort().map((path) => this.breakpointsOf(path));
  }

  async launch(ask: LaunchAsk): Promise<RunInfo> {
    if (!ask.program && !ask.runtime && !ask.url) throw new Error('launch needs program, runtime or url');
    if (ask.program && !existsSync(this.project.resolve(ask.program))) {
      throw new Error(`program not found: ${ask.program}`);
    }
    const name = ask.name ?? ask.program ?? ask.url ?? ask.runtime ?? 'debug';
    await this.stopLive();
    for (const run of this.runs.values()) {
      if (run.name === name && run.state === 'ended') this.runs.delete(run.id);
    }

    const id = String(this.next++);
    const adapter = await this.adapter.open((spec) => this.project.start(spec), `debug adapter: ${name}`);
    const run = new DebugRun(id, name, adapter, this);
    this.runs.set(id, run);
    this.holds.set(id, this.project.hold(`debug ${name}`));
    this.log.info(`debug: ${name} started`);
    if (ask.url) {
      run.url = ask.url;
      await run.begin(this.browserConfiguration(name, ask.url));
    } else {
      await run.begin(this.configuration(name, ask));
      if (this.settings().openBrowser && !this.hasTerminal()) this.awaitServer(run, null);
    }
    return run.info();
  }

  async openBrowser(runId: string, url: string): Promise<RunInfo> {
    const run = this.run(runId);
    if (run.state === 'ended') throw new Error(`run ${runId} has ended`);
    run.url = url;
    this.log.info(`debug: ${run.name} → browser at ${url}`);
    await run.openRoot(this.browserConfiguration(`${run.name} · browser`, url));
    this.project.emit('browser', { run: run.id, url });
    return run.info();
  }

  private awaitServer(run: DebugRun, watch: TerminalRun['watch'] | null): void {
    if (!this.settings().openBrowser || this.ready.has(run.id)) return;
    const watcher = new ServerReady(ServerReady.compile(this.settings().serverReady, DEBUG_DEFAULTS.serverReady));
    const listener = (data: string): void => {
      const url = watcher.feed(data);
      if (!url) return;
      this.forgetReady(run.id);
      this.openBrowser(run.id, url).catch((err) => {
        this.log.warn(`debug: browser did not open for ${run.name}: ${String(err)}`);
        this.project.emit('output', { run: run.id, session: '', category: 'stderr', text: `browser: ${String(err)}\n` });
      });
    };
    const off = watch ? watch(listener) : () => undefined;
    this.ready.set(run.id, { watcher, off });
    if (!watch) this.readyFromOutput.set(run.id, listener);
  }

  private readonly readyFromOutput = new Map<string, (data: string) => void>();

  private forgetReady(runId: string): void {
    this.ready.get(runId)?.off();
    this.ready.delete(runId);
    this.readyFromOutput.delete(runId);
  }

  private browserConfiguration(name: string, url: string): Record<string, unknown> {
    const { browser, browserArgs, webRoot } = this.settings();
    return {
      type: 'pwa-chrome',
      request: 'launch',
      name,
      url,
      webRoot: webRoot.trim() ? this.project.resolve(webRoot.trim()) : this.project.root,
      userDataDir: true,
      ...(browser.trim() ? { runtimeExecutable: browser.trim() } : {}),
      ...(browserArgs.length > 0 ? { runtimeArgs: browserArgs } : {}),
      skipFiles: SKIP_FILES,
      __workspaceFolder: this.project.root,
    };
  }

  list(): RunInfo[] {
    return [...this.runs.values()].map((run) => run.info());
  }

  async stop(runId: string, options: { force?: boolean } = {}): Promise<void> {
    await this.run(runId).stop(options);
  }

  private async stopLive(): Promise<void> {
    const live = [...this.runs.values()].filter((run) => run.state !== 'ended');
    if (live.length === 0) return;
    this.log.info(`debug: гашу предыдущие запуски: ${live.map((run) => run.name).join(', ')}`);
    await Promise.all(
      live.map((run) => run.stop().catch((err) => this.log.warn(`debug: ${run.name} not stopped: ${String(err)}`))),
    );
    const stuck = [...this.runs.values()].filter((run) => run.state === 'stopping');
    if (stuck.length > 0) {
      throw new Error(`still running: ${stuck.map((run) => run.name).join(', ')} — kill it first`);
    }
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
    for (const id of [...this.ready.keys()]) this.forgetReady(id);
    for (const run of this.runs.values()) void run.stop();
    this.runs.clear();
    for (const release of this.holds.values()) release();
    this.holds.clear();
  }

  breakpoints(): ReadonlyMap<string, readonly BreakpointAsk[]> {
    return this.lines;
  }

  toAdapter(key: string): string {
    return this.sources.toAdapter(key);
  }

  hasTerminal(): boolean {
    return this.terminalRunner !== null;
  }

  private readonly shells = new Map<string, { name: string; pid: number | undefined }>();

  async terminal(run: DebugRun, ask: TerminalAsk): Promise<{ shellProcessId?: number; processId?: number }> {
    if (!this.terminalRunner) throw new Error('no terminal in this build');
    let opened: TerminalRun;
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(ask.env ?? {})) if (typeof value === 'string') env[key] = value;
    try {
      opened = this.terminalRunner({
        name: `debug::${run.name}`,
        cwd: ask.cwd || this.project.root,
        command: shellLine.compose(ask.args),
        env,
        sameShell: shellLine.compose(ask.args, env),
      });
    } catch (err) {
      this.log.warn(`debug: terminal refused ${run.name}: ${String(err)}`);
      throw err;
    }
    this.shells.set(run.id, { name: `debug::${run.name}`, pid: opened.pid });
    this.project.emit('terminal', { run: run.id, name: `debug::${run.name}` });
    this.awaitServer(run, opened.watch);
    return { shellProcessId: opened.pid };
  }

  forget(id: string): RunInfo[] {
    const run = this.runs.get(id);
    if (run && run.state === 'ended') {
      this.runs.delete(id);
      this.project.emit('runs', this.list());
    }
    return this.list();
  }

  changed(run: DebugRun): void {
    if (run.state === 'ended') {
      this.holds.get(run.id)?.();
      this.holds.delete(run.id);
      this.forgetReady(run.id);
    }
    this.project.emit('runs', this.list());
  }

  async stuck(run: DebugRun): Promise<boolean> {
    const shell = this.shells.get(run.id);
    if (!shell || !this.terminalRunning) return false;
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
      await new Promise((done) => setTimeout(done, SETTLE_MS));
      if (this.terminalRunning(shell.name) === null) return false;
    }
    return true;
  }

  async kill(run: DebugRun): Promise<void> {
    const shell = this.shells.get(run.id);
    if (shell?.pid !== undefined) {
      await this.killTree(shell.pid, { self: false }).catch((err) =>
        this.log.warn(`debug: программа ${run.name} не погасла: ${String(err)}`),
      );
    }
    const pid = run.adapterPid;
    if (pid !== undefined) {
      await this.killTree(pid, { self: true }).catch((err) =>
        this.log.warn(`debug: адаптер ${run.name} не погас: ${String(err)}`),
      );
    }
    this.shells.delete(run.id);
  }

  stopped(run: DebugRun, session: DapSession, stop: Stop): void {
    this.project.emit('stopped', { run: run.id, session: session.id, stop });
  }

  output(run: DebugRun, session: DapSession, category: string, text: string): void {
    this.project.emit('output', { run: run.id, session: session.id, category, text });
    if (category === 'stdout' || category === 'stderr' || category === 'console') this.readyFromOutput.get(run.id)?.(text);
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
      skipFiles: SKIP_FILES,
      __workspaceFolder: root,
    };
  }
}

function trimAsk(ask: BreakpointAsk): BreakpointAsk {
  const out: BreakpointAsk = { line: ask.line };
  if (ask.condition?.trim()) out.condition = ask.condition.trim();
  if (ask.hitCondition?.trim()) out.hitCondition = ask.hitCondition.trim();
  if (ask.logMessage?.trim()) out.logMessage = ask.logMessage.trim();
  if (ask.anchor?.trim()) out.anchor = ask.anchor.trim();
  return out;
}
