import os from 'node:os';
import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import { JsDebugAdapter } from './adapter.js';
import { DebugHost } from './host.js';
import type { FileBreakpoints, Frame, LaunchAsk, RunInfo, Scope, Step, Variable } from './types.js';

export type { FileBreakpoints, Frame, LaunchAsk, RunInfo, Scope, SessionInfo, SourceRef, Step, Variable } from './types.js';

const STEPS: readonly Step[] = ['continue', 'next', 'stepIn', 'stepOut', 'pause'];

export default class DebugServer {
  private readonly adapter: JsDebugAdapter;

  constructor(private readonly ide: Ide) {
    this.adapter = new JsDebugAdapter(ide.dir, os.tmpdir());
  }

  private host(call: CallContext): DebugHost {
    return call.project.use('host', () => new DebugHost(call.project, this.adapter, this.ide.log));
  }

  @command() protected breakpoints(_params: unknown, call: CallContext): FileBreakpoints[] {
    return this.host(call).allBreakpoints();
  }

  @command() protected setBreakpoints(params: unknown, call: CallContext): Promise<FileBreakpoints> {
    const asked = params as { path?: unknown; lines?: unknown } | null;
    if (typeof asked?.path !== 'string') throw new Error('path: string is required');
    if (!Array.isArray(asked.lines) || asked.lines.some((line) => typeof line !== 'number')) {
      throw new Error('lines: number[] is required');
    }
    return this.host(call).setBreakpoints(asked.path, asked.lines as number[]);
  }

  @command() protected launch(params: unknown, call: CallContext): Promise<RunInfo> {
    return this.host(call).launch(launchAsk(params));
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
  const runtime = text('runtime');
  const cwd = text('cwd');
  const runtimeArgs = strings(asked['runtimeArgs'], 'runtimeArgs');
  const args = strings(asked['args'], 'args');
  if (name) ask.name = name;
  if (program) ask.program = program;
  if (runtime) ask.runtime = runtime;
  if (cwd) ask.cwd = cwd;
  if (runtimeArgs) ask.runtimeArgs = runtimeArgs;
  if (args) ask.args = args;
  if (env) ask.env = env as Record<string, string>;
  return ask;
}
