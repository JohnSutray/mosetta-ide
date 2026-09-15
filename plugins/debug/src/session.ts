import type { Breakpoint, SessionInfo, Stop } from './types.js';
import type { DapWire, Reverse } from './wire.js';

export interface SessionOwner {
  breakpoints(): ReadonlyMap<string, readonly number[]>;
  toAdapter(key: string): string;
  child(parent: DapSession, request: 'launch' | 'attach', configuration: Record<string, unknown>): void;
  changed(session: DapSession): void;
  stopped(session: DapSession, stop: Stop): void;
  output(session: DapSession, category: string, text: string): void;
  verified(session: DapSession, key: string): void;
}

const HANDSHAKE_MS = 30_000;

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

export class DapSession {
  state: SessionInfo['state'] = 'starting';
  stop: Stop | undefined;
  private readonly placed = new Map<string, Placed[]>();
  private readonly offs: Array<() => void> = [];

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
      supportsRunInTerminalRequest: false,
    });
    const launched = this.wire.request(request, configuration);
    await Promise.race([initialized, launched]);
    await Promise.all([...this.owner.breakpoints().keys()].map((key) => this.sync(key)));
    await this.wire.request('configurationDone');
    await launched;
  }

  async sync(key: string): Promise<void> {
    if (!this.wire.alive) return;
    const lines = this.owner.breakpoints().get(key) ?? [];
    const answer = await this.wire.request<{ breakpoints: DapBreakpoint[] }>('setBreakpoints', {
      source: { path: this.owner.toAdapter(key) },
      breakpoints: lines.map((line) => ({ line })),
    });
    this.placed.set(
      key,
      lines.map((line, at) => this.toPlaced(line, answer.breakpoints[at])),
    );
    this.owner.verified(this, key);
  }

  placedIn(key: string): readonly Breakpoint[] {
    return this.placed.get(key) ?? [];
  }

  request<T = unknown>(command: string, args?: unknown): Promise<T> {
    return this.wire.request<T>(command, args);
  }

  resumed(): void {
    this.stop = undefined;
    if (this.state === 'paused') this.setState('running');
  }

  info(): SessionInfo {
    return {
      id: this.id,
      name: this.name,
      parent: this.parent,
      state: this.state,
      ...(this.stop ? { stopped: this.stop } : {}),
    };
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    this.wire.dispose();
  }

  private toPlaced(line: number, answer: DapBreakpoint | undefined): Placed {
    if (!answer) return { line, verified: false };
    return {
      line,
      verified: answer.verified,
      ...(answer.id !== undefined ? { id: answer.id } : {}),
      ...(answer.line !== undefined && answer.line !== line ? { actual: answer.line } : {}),
      ...(answer.message ? { message: answer.message } : {}),
    };
  }

  private event(event: string, body: Record<string, unknown>): void {
    switch (event) {
      case 'stopped': {
        const stop: Stop = {
          thread: Number(body['threadId'] ?? 0),
          reason: String(body['reason'] ?? 'pause'),
          ...(typeof body['description'] === 'string' ? { description: body['description'] } : {}),
        };
        this.stop = stop;
        this.setState('paused');
        this.owner.stopped(this, stop);
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

  private breakpointChanged(answer: DapBreakpoint | undefined): void {
    if (!answer || answer.id === undefined) return;
    for (const [key, list] of this.placed) {
      const at = list.findIndex((one) => one.id === answer.id);
      if (at === -1) continue;
      list[at] = this.toPlaced(list[at]!.line, answer);
      this.owner.verified(this, key);
      return;
    }
  }

  private reverse(request: Reverse): void {
    if (request.command !== 'startDebugging') {
      this.wire.refuse(request, `${request.command} is not supported`);
      return;
    }
    const args = (request.arguments ?? {}) as { request?: string; configuration?: Record<string, unknown> };
    this.wire.respond(request);
    this.owner.child(this, args.request === 'attach' ? 'attach' : 'launch', args.configuration ?? {});
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
