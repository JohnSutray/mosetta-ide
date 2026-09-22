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

/**
 * Whose scripts the debugger SKIPS.
 *
 * React 19 in dev mode gives birth through eval to functions with
 * `sourceURL=about://React/…` and a map onto a real file — and CALLS them, so that a
 * server component's stack in the console shows `layout.tsx`. A breakpoint in
 * `layout.tsx` landed through the map in the counterfeit as well, and fired on every
 * revival of an RSC answer: in the SSR process, in the browser, on every request. One
 * real stop and five counterfeit ones.
 *
 * Skipping is not enough: on a breakpoint in a skipped script the adapter stops all the
 * same, and it marks the file the counterfeit referred to through its map as skipped
 * WHOLE — so a real stop cannot be told from a counterfeit one by the marks. So a stop
 * in such a file is checked by the session itself (`DapSession.arrived`).
 */
const SKIP_FILES = ['<node_internals>/**', 'about://React/**'];

/** How much of the project the debugger needs — exactly that much, and no more. */
export type DebugProject = Pick<Project, 'root' | 'resolve' | 'emit' | 'hold' | 'start'>;

/**
 * A real terminal for the program: who will carry out the line in the project's
 * console. `null` means there is no terminal in this build, and the adapter starts the
 * program itself.
 */
export interface TerminalAskOut {
  name: string;
  cwd: string;
  /** What to type at the prompt. */
  command: string;
  /** The environment for a NEW shell: the variables enter it at birth. */
  env: Record<string, string>;
  /**
   * The same command for an ALREADY OPEN shell: its environment cannot be changed, so
   * it travels in the line.
   */
  sameShell: string;
}

/** What the terminal returned: who lives there and how to read its output. */
export interface TerminalRun {
  pid: number;
  /**
   * Read the terminal's output; returns an unsubscribe. The debugger waits there for
   * the server's address.
   */
  watch: (listener: (data: string) => void) => () => void;
}

export type TerminalRunner = ((ask: TerminalAskOut) => TerminalRun) | null;

/** How soon to ask "is the program dead yet?", and how many times. */
const SETTLE_MS = 150;
const SETTLE_TRIES = 8;

export class DebugHost implements ProjectResource, RunOwner {
  private readonly lines = new Map<string, BreakpointAsk[]>();
  /** Which exceptions to stop on — the project's property, like the breakpoints. */
  private exceptionMode: ExceptionMode = 'none';
  private readonly runs = new Map<string, DebugRun>();
  private readonly holds = new Map<string, () => void>();
  private readonly sources: Sources;
  /**
   * The files BEYOND the root that the adapter named in the stack. We may read those
   * from the disk and no others: the path was named by the debugger rather than by the
   * tab, and that is the only thing telling "show the frame from `~/.nvm`" apart from a
   * door outwards for any path.
   */
  private readonly foreign = new Set<string>();
  /**
   * Who is waiting for the server's address in a run's output: run → watcher and
   * unsubscribe.
   */
  private readonly ready = new Map<string, { watcher: ServerReady; off: () => void }>();
  private next = 1;

  constructor(
    private readonly project: DebugProject,
    private readonly adapter: JsDebugAdapter,
    private readonly log: Logger,
    private readonly terminalRunner: TerminalRunner = null,
    private readonly readDisk: (absolute: string) => Promise<string> = (absolute) => readFile(absolute, 'utf8'),
    /**
     * The settings section as a function: an edit to the file is visible without a
     * restart.
     */
    private readonly settings: () => DebugSettings = () => DEBUG_DEFAULTS,
    /**
     * Whether a program is running in this terminal — we ask the neighbour. `null`
     * where there are no terminals at all: then the program was started by the adapter
     * itself, and it goes away with it.
     */
    private readonly terminalRunning: ((name: string) => { pid: number | undefined } | null) | null = null,
    /** Kill a process tree — a core service (`ide.killTree`). */
    private readonly killTree: (pid: number, options?: { self?: boolean }) => Promise<number> = async () => 0,
  ) {
    this.sources = new Sources(project.root, (relative) => project.resolve(relative));
  }

  /** Set a file's breakpoints WHOLE: an empty list takes them all off. */
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

  /**
   * The state of a file's breakpoints across every live session. A breakpoint is
   * confirmed if AT LEAST ONE has confirmed it: in an `npm → node` tree the script is
   * loaded in one process only, and the rest honestly answer "I know no such line".
   */
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

  /** Which exceptions to stop on — to every live session at once. */
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

  /**
   * Open a page in the browser under the debugger — as a second root of THE SAME run.
   * By the same adapter: it has one socket for every session, and "stop" puts out the
   * server together with the browser.
   */
  async openBrowser(runId: string, url: string): Promise<RunInfo> {
    const run = this.run(runId);
    if (run.state === 'ended') throw new Error(`run ${runId} has ended`);
    run.url = url;
    this.log.info(`debug: ${run.name} → browser at ${url}`);
    await run.openRoot(this.browserConfiguration(`${run.name} · browser`, url));
    this.project.emit('browser', { run: run.id, url });
    return run.info();
  }

  /**
   * Watch a run's output: the program has printed an address — open it in the browser
   * under the debugger. We look where the user looks: into the program's terminal;
   * with no terminal (Windows) into the output events.
   */
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

  /** With no terminal the address is looked for in the output events: run → listener. */
  private readonly readyFromOutput = new Map<string, (data: string) => void>();

  private forgetReady(runId: string): void {
    this.ready.get(runId)?.off();
    this.ready.delete(runId);
    this.readyFromOutput.delete(runId);
  }

  /**
   * The browser's configuration: the adapter finds Chrome itself (or whatever is named
   * in the setting), gives it a PROFILE of its own in a temporary directory — the
   * user's windows and bookmarks are left alone — and opens the address. `webRoot` is
   * where paths from the page land: `/app.js` → `<root>/app.js`.
   */
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

  /**
   * Put out everything currently being debugged.
   *
   * One trouble does not bring the others down: a run that did not go out must not stop
   * a new one starting — the journal will tell of it.
   */
  private async stopLive(): Promise<void> {
    const live = [...this.runs.values()].filter((run) => run.state !== 'ended');
    if (live.length === 0) return;
    this.log.info(`debug: putting out the previous runs: ${live.map((run) => run.name).join(', ')}`);
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

  /**
   * The text of a file BEYOND the root — only of one the adapter named in the stack. We
   * read the disk ourselves, past the core's OS layer: its door outwards checks the
   * root, and widening it for the sake of one reader is not allowed.
   */
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

  /** Text that is not on the disk: `<node_internals>/…`, a source from a map. */
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

  /**
   * Where a run's program lives: the terminal's name and the pid of its SHELL. Needed
   * for exactly two questions — whether it is still alive and how to kill it: in a
   * terminal the program is not our child but a descendant of the user's shell.
   */
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

  /**
   * Remove a FINISHED run from the list.
   *
   * A live one is left alone: it is put out by "stop", and the two actions must not be
   * confused. Before this, a finished run only went away by itself when a new one
   * started WITH THE SAME NAME — that is, having debugged one file the user was left
   * with its badge for ever, and there was nothing to remove it with.
   */
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

  /**
   * Whether the program is alive after a polite stop.
   *
   * We ask the TERMINAL: there the program is a descendant of the user's shell, and a
   * `disconnect` does not always reach it. Where there is no terminal the program was
   * started by the adapter itself and goes away with it — there is nothing to lie about
   * there, and we answer "dead".
   */
  async stuck(run: DebugRun): Promise<boolean> {
    const shell = this.shells.get(run.id);
    if (!shell || !this.terminalRunning) return false;
    for (let attempt = 0; attempt < SETTLE_TRIES; attempt += 1) {
      await new Promise((done) => setTimeout(done, SETTLE_MS));
      if (this.terminalRunning(shell.name) === null) return false;
    }
    return true;
  }

  /**
   * KILL a run's process tree: the adapter with its descendants, and the program in the
   * terminal. The user's shell is left alone — we put out only what was started in it.
   */
  async kill(run: DebugRun): Promise<void> {
    const shell = this.shells.get(run.id);
    if (shell?.pid !== undefined) {
      await this.killTree(shell.pid, { self: false }).catch((err) =>
        this.log.warn(`debug: the program ${run.name} did not go out: ${String(err)}`),
      );
    }
    const pid = run.adapterPid;
    if (pid !== undefined) {
      await this.killTree(pid, { self: true }).catch((err) =>
        this.log.warn(`debug: the adapter ${run.name} did not go out: ${String(err)}`),
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

  /**
   * The `pwa-node` configuration for the adapter.
   *
   * `__workspaceFolder` is documented nowhere, but without it the source maps are not
   * looked for AT ALL: the program runs straight past a breakpoint in a `.ts` without a
   * single error. VS Code supplies it itself; we are guarded by a test with a compiled
   * fixture file.
   */
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

/** A request with no empty strings in it: an empty condition is the absence of one. */
function trimAsk(ask: BreakpointAsk): BreakpointAsk {
  const out: BreakpointAsk = { line: ask.line };
  if (ask.condition?.trim()) out.condition = ask.condition.trim();
  if (ask.hitCondition?.trim()) out.hitCondition = ask.hitCondition.trim();
  if (ask.logMessage?.trim()) out.logMessage = ask.logMessage.trim();
  if (ask.anchor?.trim()) out.anchor = ask.anchor.trim();
  return out;
}
