import { command, type CallContext, type Ide } from '@ide/api/server';
import { TerminalHost } from './host.js';
import { TERMINAL_DEFAULTS } from './settings.js';
import { Shells } from './shells.js';
import type { Attached, OpenAsk, ShellChoice, ShellInfo, TerminalInfo } from './types.js';

export default class TerminalServer {
  private readonly shells: Shells;

  constructor(private readonly ide: Ide) {
    this.shells = new Shells((name) => ide.which(name));
  }

  private shell(): ShellChoice {
    return {
      ...this.shells.loginShell(this.ide.settings('terminal', TERMINAL_DEFAULTS)),
      env: this.ide.environment(),
    };
  }

  private host(call: CallContext): TerminalHost {
    return call.project.use(
      'host',
      () => new TerminalHost(call.project, this.ide.log, () => this.shell()),
    );
  }

  @command('shells') protected detectShells(): ShellInfo[] {
    return this.shells.detect(this.shell().file);
  }

  @command() protected list(_params: unknown, call: CallContext): TerminalInfo[] {
    return this.host(call).list();
  }

  @command() protected create(params: unknown, call: CallContext): TerminalInfo {
    const asked = (params ?? {}) as { cols?: number; rows?: number };
    return this.host(call).create({ ...size(asked), cwd: call.project.root });
  }

  @command() protected open(params: unknown, call: CallContext): TerminalInfo {
    const asked = params as OpenAsk | null;
    if (!asked || typeof asked.name !== 'string' || asked.name.trim() === '') {
      throw new Error('нужен name: string');
    }
    return this.host(call).open({
      name: asked.name,
      ...(asked.kind ? { kind: asked.kind } : {}),
      ...(asked.command ? { command: asked.command } : {}),
      cwd: asked.cwd ? call.project.resolve(asked.cwd) : call.project.root,
      ...size(asked),
    });
  }

  @command() protected attach(params: unknown, call: CallContext): Attached {
    return this.host(call).attach(nameOf(params));
  }

  @command() protected write(params: unknown, call: CallContext): null {
    const asked = params as { data?: unknown } | null;
    if (typeof asked?.data !== 'string') throw new Error('нужен data: string');
    this.host(call).write(nameOf(params), asked.data);
    return null;
  }

  @command() protected resize(params: unknown, call: CallContext): null {
    const asked = params as { cols?: unknown; rows?: unknown } | null;
    if (typeof asked?.cols !== 'number' || typeof asked?.rows !== 'number') {
      throw new Error('нужны cols и rows');
    }
    this.host(call).resize(nameOf(params), asked.cols, asked.rows);
    return null;
  }

  @command() protected close(params: unknown, call: CallContext): null {
    this.host(call).close(nameOf(params));
    return null;
  }
}

function nameOf(params: unknown): string {
  const asked = params as { name?: unknown } | null;
  if (!asked || typeof asked.name !== 'string' || asked.name.trim() === '') {
    throw new Error('нужен name: string');
  }
  return asked.name;
}

function size(asked: { cols?: number; rows?: number }): { cols?: number; rows?: number } {
  return {
    ...(asked.cols ? { cols: asked.cols } : {}),
    ...(asked.rows ? { rows: asked.rows } : {}),
  };
}
