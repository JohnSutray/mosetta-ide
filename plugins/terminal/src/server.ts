import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { TerminalHost } from './host.js';
import { TERMINAL_DEFAULTS } from './settings.js';
import { Shells } from './shells.js';
import type { Attached, OpenAsk, ShellChoice, ShellInfo, TerminalInfo } from './types.js';

/**
 * The terminals' server half.
 *
 * Exactly what the PROJECT was added to the contract for: a pty lives as long as the
 * project (`use`), prints of its own accord (`emit`) and has to survive the panel
 * closing (`hold`). A plugin had none of the three before, and that is why terminals
 * stayed in the core.
 *
 * The host is taken with `project.use` rather than kept as a class field: there is ONE
 * plugin per server, while there are as many sets of terminals as there are open
 * projects. As a field it would silently hand the second project the first one's
 * terminals.
 */
export default class TerminalServer {
  /** The machine's shells are our knowledge; the user's PATH comes from the core. */
  private readonly shells: Shells;

  /**
   * Projects by root — for a neighbour arriving with a `Project` OF THEIR OWN. The
   * `use` keys are partitioned per plugin: somebody else's `project.use('host')` would
   * hand over their resource rather than our terminals. So the neighbour names the
   * root, and the project under it is ours.
   */
  private readonly projects = new Map<string, Project>();

  constructor(private readonly ide: Ide) {
    this.shells = new Shells((name) => ide.which(name));
  }

  @activate() protected start(): void {
    this.ide.onProject((project) => {
      this.projects.set(project.root, project);
      project.use('roster', () => ({
        dispose: () => {
          if (this.projects.get(project.root) === project) this.projects.delete(project.root);
        },
      }));
    });
  }

  /**
   * What to open a terminal with, and with what environment. Asked EVERY time: choose
   * another shell in the settings file and the next terminal starts with it, without a
   * restart. The environment is the user's, from the core.
   */
  private shell(): ShellChoice {
    return {
      ...this.shells.loginShell(this.ide.settings('terminal', TERMINAL_DEFAULTS)),
      env: this.ide.environment(),
    };
  }

  /**
   * THIS project's terminals. They are set up on first use and go out with it. The host
   * tells the tabs through events itself: it has the project in its hands, and a second
   * bridge would be a second place obliged to agree.
   */
  private host(call: CallContext): TerminalHost {
    return call.project.use(
      'host',
      () => new TerminalHost(call.project, this.ide.log, () => this.shell()),
    );
  }

  /**
   * Run a command in THIS project's terminal — for a neighbour on the server. The
   * debugger's adapter sends it a ready launch line, and that belongs in a real console
   * rather than in output events. The directory arrives absolute: the adapter named it,
   * not the tab.
   */
  runIn(
    root: string,
    options: { name: string; command: string; cwd: string; env?: Record<string, string>; sameShell?: string },
  ): TerminalInfo {
    const project = this.projects.get(root);
    if (!project) throw new Error(`no project open at ${root}`);
    const host = project.use('host', () => new TerminalHost(project, this.ide.log, () => this.shell()));
    return host.runIn({ ...options, kind: 'script' });
  }

  /**
   * Whether a program is running in this terminal — and the pid of its SHELL.
   *
   * Asked by the debugger after it has asked a program to stop: "stopped" and "asked to
   * stop" are different things, and lying about that is not on. `null` means there is
   * no terminal, or it is at the prompt.
   */
  runningIn(root: string, name: string): { pid: number | undefined } | null {
    const project = this.projects.get(root);
    if (!project) return null;
    const host = project.use('host', () => new TerminalHost(project, this.ide.log, () => this.shell()));
    return host.running(name);
  }

  /** Read a project terminal's output on the server. Returns an unsubscribe. */
  watch(root: string, name: string, listener: (data: string) => void): () => void {
    const project = this.projects.get(root);
    if (!project) throw new Error(`no project open at ${root}`);
    const host = project.use('host', () => new TerminalHost(project, this.ide.log, () => this.shell()));
    return host.watch(name, listener);
  }

  /** Which shells exist on the machine, and which one is in use. */
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

  /**
   * Open by name, or return the existing one. Called both from the client and by a
   * neighbouring plugin: the `dev` script lands in its own terminal.
   */
  @command() protected open(params: unknown, call: CallContext): TerminalInfo {
    const asked = params as OpenAsk | null;
    if (!asked || typeof asked.name !== 'string' || asked.name.trim() === '') {
      throw new Error('name: string required');
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
    if (typeof asked?.data !== 'string') throw new Error('data: string required');
    this.host(call).write(nameOf(params), asked.data);
    return null;
  }

  @command() protected resize(params: unknown, call: CallContext): null {
    const asked = params as { cols?: unknown; rows?: unknown } | null;
    if (typeof asked?.cols !== 'number' || typeof asked?.rows !== 'number') {
      throw new Error('cols and rows required');
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
    throw new Error('name: string required');
  }
  return asked.name;
}

/** The size does not always arrive: a tab reports it once it has measured the panel. */
function size(asked: { cols?: number; rows?: number }): { cols?: number; rows?: number } {
  return {
    ...(asked.cols ? { cols: asked.cols } : {}),
    ...(asked.rows ? { rows: asked.rows } : {}),
  };
}
