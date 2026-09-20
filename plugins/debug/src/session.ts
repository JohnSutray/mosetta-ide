import type { Breakpoint, BreakpointAsk, ExceptionMode, SessionInfo, Stop } from './types.js';
import type { DapWire, Reverse } from './wire.js';

/** What a session needs from the run it belongs to. */
export interface SessionOwner {
  /** The project's breakpoints: key → requests. Asked for at the moment of sending. */
  breakpoints(): ReadonlyMap<string, readonly BreakpointAsk[]>;
  /** Which exceptions to stop on — also the project's property. */
  exceptions(): ExceptionMode;
  toAdapter(key: string): string;
  /** The adapter asks for a child session to be opened — for a new process. */
  child(parent: DapSession, request: 'launch' | 'attach', configuration: Record<string, unknown>): void;
  /**
   * The adapter asks for the program to be carried out in a real terminal. `null` means
   * we have no terminal, and the adapter has been told so in advance
   * (`supportsRunInTerminalRequest`), so the request will not come.
   */
  runInTerminal: ((ask: TerminalAsk) => Promise<{ shellProcessId?: number; processId?: number }>) | null;
  /**
   * A stop in one of React's counterfeits — we went on by ourselves, without showing
   * it.
   */
  skipped(session: DapSession): void;
  changed(session: DapSession): void;
  stopped(session: DapSession, stop: Stop): void;
  output(session: DapSession, category: string, text: string): void;
  verified(session: DapSession, key: string): void;
}

/**
 * How long to wait for a session's handshake. Usually tens of milliseconds; the
 * deadline is not about speed but about a lost answer becoming an error in words rather
 * than an eternal wait, which from outside is indistinguishable from "thinking".
 */
const HANDSHAKE_MS = 30_000;

/** A `runInTerminal` request, as DAP words it. */
export interface TerminalAsk {
  kind?: 'integrated' | 'external';
  title?: string;
  cwd: string;
  args: string[];
  env?: Record<string, string | null>;
}

interface Placed extends Breakpoint {
  id?: number;
}

interface DapBreakpoint {
  id?: number;
  verified: boolean;
  line?: number;
  message?: string;
  source?: { path?: string };
}

/**
 * One DAP session is one connection to the adapter and one process of the program.
 *
 * The opening ritual is the same for all of them, and the order in it is not a matter
 * of taste: the `launch` request goes off AT ONCE, but the answer to it comes only
 * after `configurationDone`, while breakpoints can only be set between the
 * `initialized` event and that `configurationDone`. Waiting for the answer to `launch`
 * before sending the breakpoints means hanging for ever.
 */
export class DapSession {
  state: SessionInfo['state'] = 'starting';
  stop: Stop | undefined;
  /** What the adapter answered about THIS session's breakpoints: key → one per line. */
  private readonly placed = new Map<string, Placed[]>();
  private readonly offs: Array<() => void> = [];

  /** Where the program lives; set from the configuration at `begin`. */
  kind: 'node' | 'browser' = 'node';

  constructor(
    readonly id: string,
    readonly name: string,
    readonly parent: string | null,
    private readonly wire: DapWire,
    private readonly owner: SessionOwner,
  ) {
    this.offs.push(wire.onEvent((event, body) => this.event(event, body as Record<string, unknown>)));
    this.offs.push(wire.onClose(() => this.end()));
    wire.onReverse = (request) => this.reverse(request);
  }

  async begin(request: 'launch' | 'attach', configuration: Record<string, unknown>): Promise<void> {
    if (String(configuration['type'] ?? '').includes('chrome') || String(configuration['type'] ?? '').includes('msedge')) {
      this.kind = 'browser';
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${request}: debug adapter did not finish the handshake in ${HANDSHAKE_MS / 1000} s`)),
        HANDSHAKE_MS,
      );
    });
    try {
      await Promise.race([this.handshake(request, configuration), deadline]);
    } finally {
      clearTimeout(timer);
    }
    if (this.state === 'starting') this.setState('running');
  }

  private async handshake(request: 'launch' | 'attach', configuration: Record<string, unknown>): Promise<void> {
    const initialized = new Promise<void>((resolve) => {
      const off = this.wire.onEvent((event) => {
        if (event !== 'initialized') return;
        off();
        resolve();
      });
    });
    await this.wire.request('initialize', {
      clientID: 'mosetta',
      clientName: 'Mosetta IDE',
      adapterID: 'pwa-node',
      pathFormat: 'path',
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsStartDebuggingRequest: true,
      supportsRunInTerminalRequest: this.owner.runInTerminal !== null,
    });
    const launched = this.wire.request(request, configuration);
    await Promise.race([initialized, launched]);
    await Promise.all([...this.owner.breakpoints().keys()].map((key) => this.sync(key)));
    await this.syncExceptions();
    await this.wire.request('configurationDone');
    await launched;
  }

  /** Send the adapter one file's breakpoints — all the ones standing now. */
  async sync(key: string): Promise<void> {
    if (!this.wire.alive) return;
    const asks = this.owner.breakpoints().get(key) ?? [];
    const answer = await this.wire.request<{ breakpoints: DapBreakpoint[] }>('setBreakpoints', {
      source: { path: this.owner.toAdapter(key) },
      breakpoints: asks.map((ask) => ({
        line: ask.line,
        ...(ask.condition ? { condition: ask.condition } : {}),
        ...(ask.hitCondition ? { hitCondition: ask.hitCondition } : {}),
        ...(ask.logMessage ? { logMessage: ask.logMessage } : {}),
      })),
    });
    this.placed.set(
      key,
      asks.map((ask, at) => this.toPlaced(ask, answer.breakpoints[at])),
    );
    this.owner.verified(this, key);
  }

  /** Tell the adapter which exceptions to stop on. Its words: `all`, `uncaught`. */
  async syncExceptions(): Promise<void> {
    if (!this.wire.alive) return;
    const mode = this.owner.exceptions();
    const filters = mode === 'all' ? ['all', 'uncaught'] : mode === 'uncaught' ? ['uncaught'] : [];
    await this.wire.request('setExceptionBreakpoints', { filters });
  }

  placedIn(key: string): readonly Breakpoint[] {
    return this.placed.get(key) ?? [];
  }

  request<T = unknown>(command: string, args?: unknown): Promise<T> {
    return this.wire.request<T>(command, args);
  }

  /** A step has begun — the program is running again, until the adapter says otherwise. */
  resumed(): void {
    this.stop = undefined;
    if (this.state === 'paused') this.setState('running');
  }

  info(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      parent: this.parent,
      kind: this.kind,
      state: this.state,
      ...(this.stop ? { stopped: this.stop } : {}),
    };
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.wire.dispose();
  }

  private toPlaced(ask: BreakpointAsk, answer: DapBreakpoint | undefined): Placed {
    if (!answer) return { ...ask, verified: false };
    return {
      ...ask,
      verified: answer.verified,
      ...(answer.id !== undefined ? { id: answer.id } : {}),
      ...(answer.line !== undefined && answer.line !== ask.line ? { actual: answer.line } : {}),
      ...(answer.message ? { message: answer.message } : {}),
    };
  }

  private event(event: string, body: Record<string, unknown>): void {
    switch (event) {
      case 'stopped': {
        const description = [body['description'], body['text']].filter((one) => typeof one === 'string' && one).join(': ');
        const stop: Stop = {
          thread: Number(body['threadId'] ?? 0),
          reason: String(body['reason'] ?? 'pause'),
          ...(description ? { description } : {}),
        };
        void this.arrived(stop);
        return;
      }
      case 'continued':
        this.resumed();
        return;
      case 'terminated':
        this.end();
        return;
      case 'output': {
        const text = body['output'];
        if (typeof text === 'string') this.owner.output(this, String(body['category'] ?? 'console'), text);
        return;
      }
      case 'breakpoint':
        this.breakpointChanged(body['breakpoint'] as DapBreakpoint | undefined);
        return;
    }
  }

  /**
   * We have stopped — but where?
   *
   * React 19 in dev mode gives birth through eval to functions with
   * `sourceURL=about://React/…` and a map onto a real file, and CALLS them for the sake
   * of a pretty stack. A breakpoint in `layout.tsx` lands through the map in the
   * counterfeit as well. The adapter skips such a script (`skipFiles`), but on a
   * breakpoint in it it stops all the same, and it marks the file as skipped whole — by
   * its marks a real stop cannot be told from a counterfeit one.
   *
   * V8 ITSELF tells them apart: `new Error().stack`, evaluated in the stopped frame,
   * names the script by its real address — it does not use the map, neither in Node nor
   * in the browser. A counterfeit — we go on and count it; the stop is not shown to the
   * human at all.
   */
  private async arrived(stop: Stop): Promise<void> {
    if (stop.reason === 'exception') stop = { ...stop, description: await this.exceptionText(stop) };
    if (stop.reason === 'breakpoint' && (await this.inFakeFrame(stop.thread))) {
      this.owner.skipped(this);
      await this.wire.request('continue', { threadId: stop.thread }).catch(() => undefined);
      return;
    }
    this.stop = stop;
    this.setState('paused');
    this.owner.stopped(this, stop);
  }

  /**
   * What kind of exception: "Paused on exception" with no name of the error says
   * nothing.
   */
  private async exceptionText(stop: Stop): Promise<string | undefined> {
    try {
      const info = await this.wire.request<{ exceptionId?: string; description?: string }>('exceptionInfo', {
        threadId: stop.thread,
      });
      const said = (info.description ?? info.exceptionId ?? '').split('\n')[0]?.trim();
      return said ? said : stop.description;
    } catch {
      return stop.description;
    }
  }

  private async inFakeFrame(thread: number): Promise<boolean> {
    try {
      const { stackFrames } = await this.wire.request<{
        stackFrames: Array<{ id: number; presentationHint?: string; source?: { origin?: string } }>;
      }>('stackTrace', { threadId: thread, levels: 1 });
      const top = stackFrames[0];
      if (!top || top.presentationHint !== 'deemphasize' || !/skipFiles/i.test(top.source?.origin ?? '')) return false;
      const answer = await this.wire.request<{ result: string }>('evaluate', {
        expression: 'new Error().stack',
        frameId: top.id,
        context: 'repl',
      });
      return /about:\/\/React\//.test(String(answer.result).split('\n').slice(0, 3).join('\n'));
    } catch {
      return false;
    }
  }

  /**
   * The confirmation comes LATER than the answer: while the script is not loaded, the
   * adapter knows nothing about the line. We look the breakpoint up by number.
   */
  private breakpointChanged(answer: DapBreakpoint | undefined): void {
    if (!answer || answer.id === undefined) return;
    for (const [key, list] of this.placed) {
      const at = list.findIndex((one) => one.id === answer.id);
      if (at === -1) continue;
      list[at] = this.toPlaced(list[at]!, answer);
      this.owner.verified(this, key);
      return;
    }
  }

  private reverse(request: Reverse): void {
    if (request.command === 'startDebugging') {
      const args = (request.arguments ?? {}) as { request?: string; configuration?: Record<string, unknown> };
      this.wire.respond(request);
      this.owner.child(this, args.request === 'attach' ? 'attach' : 'launch', args.configuration ?? {});
      return;
    }
    if (request.command === 'runInTerminal' && this.owner.runInTerminal) {
      this.owner
        .runInTerminal(request.arguments as TerminalAsk)
        .then((body) => this.wire.respond(request, body))
        .catch((err: unknown) => this.wire.refuse(request, err instanceof Error ? err.message : String(err)));
      return;
    }
    this.wire.refuse(request, `${request.command} is not supported`);
  }

  private end(): void {
    if (this.state === 'ended') return;
    this.stop = undefined;
    this.setState('ended');
  }

  private setState(state: SessionInfo['state']): void {
    this.state = state;
    this.owner.changed(this);
  }
}
