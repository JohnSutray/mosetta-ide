import os from 'node:os';
import { command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import TerminalServer from '@mosetta/ide-plugin-terminal/server';
import { JsDebugAdapter } from './adapter.js';
import { DebugHost, type TerminalRunner } from './host.js';
import { DEBUG_DEFAULTS } from './settings.js';
import type { BreakpointAsk, ExceptionMode, FileBreakpoints, Frame, LaunchAsk, RunInfo, Scope, Step, Variable } from './types.js';

export type { BreakpointAsk, ExceptionMode, FileBreakpoints, Frame, LaunchAsk, RunInfo, Scope, SessionInfo, SourceRef, Step, Variable } from './types.js';

const STEPS: readonly Step[] = ['continue', 'next', 'stepIn', 'stepOut', 'pause'];

export default class DebugServer {
  private readonly adapter: JsDebugAdapter;

  constructor(private readonly ide: Ide) {
    this.adapter = new JsDebugAdapter(ide.dir, os.tmpdir());
  }

  private host(call: CallContext): DebugHost {
    return call.project.use(
      'host',
      () =>
        new DebugHost(
          call.project,
          this.adapter,
          this.ide.log,
          this.terminalRunner(call.project),
          undefined,
          () => call.project.settings('debug', DEBUG_DEFAULTS),
        ),
    );
  }

  private terminalRunner(project: Project): TerminalRunner {
    if (process.platform === 'win32') return null;
    let terminal: TerminalServer;
    try {
      terminal = this.ide.getPlugin(TerminalServer);
    } catch {
      return null;
    }
    return (ask) => ({
      pid: terminal.runIn(project.root, ask).pid,
      watch: (listener) => terminal.watch(project.root, ask.name, listener),
    });
  }

  @command() protected breakpoints(_params: unknown, call: CallContext): FileBreakpoints[] {
    return this.host(call).allBreakpoints();
  }

  @command() protected setBreakpoints(params: unknown, call: CallContext): Promise<FileBreakpoints> {
    const asked = params as { path?: unknown; breakpoints?: unknown } | null;
    if (typeof asked?.path !== 'string') throw new Error('path: string is required');
    if (!Array.isArray(asked.breakpoints)) throw new Error('breakpoints: array is required');
    return this.host(call).setBreakpoints(asked.path, asked.breakpoints.map(breakpointAsk));
  }

  @command() protected exceptions(_params: unknown, call: CallContext): ExceptionMode {
    return this.host(call).exceptions();
  }

  @command() protected setExceptions(params: unknown, call: CallContext): Promise<ExceptionMode> {
    const mode = field(params, 'mode');
    if (mode !== 'none' && mode !== 'uncaught' && mode !== 'all') throw new Error('mode must be none, uncaught or all');
    return this.host(call).setExceptions(mode);
  }

  @command() protected launch(params: unknown, call: CallContext): Promise<RunInfo> {
    return this.host(call).launch(launchAsk(params));
  }

  @command() protected openBrowser(params: unknown, call: CallContext): Promise<RunInfo> {
    return this.host(call).openBrowser(field(params, 'run'), field(params, 'url'));
  }

  @command() protected runs(_params: unknown, call: CallContext): RunInfo[] {
    return this.host(call).list();
  }

  @command() protected async stop(params: unknown, call: CallContext): Promise<null> {
    await this.host(call).stop(field(params, 'run'));
    return null;
  }

  @command() protected async step(params: unknown, call: CallContext): Promise<null> {
    const action = field(params, 'action') as Step;
    if (!STEPS.includes(action)) throw new Error(`action must be one of ${STEPS.join(', ')}`);
    await this.host(call).step(field(params, 'run'), field(params, 'session'), number(params, 'thread'), action);
    return null;
  }

  @command() protected stack(params: unknown, call: CallContext): Promise<Frame[]> {
    return this.host(call).stack(field(params, 'run'), field(params, 'session'), number(params, 'thread'));
  }

  @command() protected scopes(params: unknown, call: CallContext): Promise<Scope[]> {
    return this.host(call).scopes(field(params, 'run'), field(params, 'session'), number(params, 'frame'));
  }

  @command() protected variables(params: unknown, call: CallContext): Promise<Variable[]> {
    return this.host(call).variables(field(params, 'run'), field(params, 'session'), number(params, 'ref'));
  }

  @command() protected evaluate(params: unknown, call: CallContext): Promise<Variable> {
    const asked = params as { frame?: unknown; context?: unknown };
    const context = asked.context === 'watch' || asked.context === 'repl' ? asked.context : 'hover';
    return this.host(call).evaluate(
      field(params, 'run'),
      field(params, 'session'),
      field(params, 'expression'),
      typeof asked.frame === 'number' ? asked.frame : undefined,
      context,
    );
  }

  @command() protected source(params: unknown, call: CallContext): Promise<{ text: string; mime?: string }> {
    return this.host(call).source(field(params, 'run'), field(params, 'session'), number(params, 'reference'));
  }

  @command() protected readForeign(params: unknown, call: CallContext): Promise<{ text: string }> {
    return this.host(call).readForeign(field(params, 'absolute'));
  }
}

function field(params: unknown, name: string): string {
  const value = (params as Record<string, unknown> | null)?.[name];
  if (typeof value !== 'string' || value === '') throw new Error(`${name}: string is required`);
  return value;
}

function number(params: unknown, name: string): number {
  const value = (params as Record<string, unknown> | null)?.[name];
  if (typeof value !== 'number') throw new Error(`${name}: number is required`);
  return value;
}

function strings(value: unknown, name: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((one) => typeof one !== 'string')) {
    throw new Error(`${name}: string[] expected`);
  }
  return value as string[];
}

function launchAsk(params: unknown): LaunchAsk {
  const asked = (params ?? {}) as Record<string, unknown>;
  const text = (name: string): string | undefined => {
    const value = asked[name];
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new Error(`${name}: string expected`);
    return value;
  };
  const env = asked['env'];
  if (env !== undefined && (typeof env !== 'object' || env === null)) throw new Error('env: object expected');
  const ask: LaunchAsk = {};
  const name = text('name');
  const program = text('program');
  const url = text('url');
  const runtime = text('runtime');
  const cwd = text('cwd');
  const runtimeArgs = strings(asked['runtimeArgs'], 'runtimeArgs');
  const args = strings(asked['args'], 'args');
  if (name) ask.name = name;
  if (program) ask.program = program;
  if (url) ask.url = url;
  if (runtime) ask.runtime = runtime;
  if (cwd) ask.cwd = cwd;
  if (runtimeArgs) ask.runtimeArgs = runtimeArgs;
  if (args) ask.args = args;
  if (env) ask.env = env as Record<string, string>;
  return ask;
}

function breakpointAsk(value: unknown): BreakpointAsk {
  const one = value as Record<string, unknown> | null;
  if (typeof one?.['line'] !== 'number') throw new Error('breakpoint.line: number is required');
  const ask: BreakpointAsk = { line: one['line'] };
  for (const key of ['condition', 'hitCondition', 'logMessage'] as const) {
    const text = one[key];
    if (text === undefined) continue;
    if (typeof text !== 'string') throw new Error(`breakpoint.${key}: string expected`);
    ask[key] = text;
  }
  return ask;
}
