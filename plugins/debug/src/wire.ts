
/** The stream structurally: Node's socket fits as it is, and a test slips in its own. */
export interface Stream {
  write(data: Uint8Array): unknown;
  on(event: 'data', handler: (chunk: Uint8Array) => void): unknown;
  on(event: 'close', handler: () => void): unknown;
  on(event: 'error', handler: (err: Error) => void): unknown;
  destroy(): void;
}

export interface Reverse {
  seq: number;
  command: string;
  arguments: unknown;
}

type Pending = { command: string; resolve: (body: unknown) => void; reject: (err: Error) => void };

export class DapWire {
  private buffer: Buffer = Buffer.alloc(0);
  private seq = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly events = new Set<(event: string, body: unknown) => void>();
  private readonly closers = new Set<(why: string) => void>();
  private closed: string | null = null;
  /**
   * A request coming the other way from the adapter. An answer is obligatory: the
   * adapter is waiting for it.
   */
  onReverse: (request: Reverse) => void = (request) => this.refuse(request, 'not supported');

  constructor(private readonly stream: Stream) {
    stream.on('data', (chunk) => this.feed(chunk));
    stream.on('error', (err) => this.close(err.message));
    stream.on('close', () => this.close('connection closed'));
  }

  request<T = unknown>(command: string, args?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(new Error(`${command}: ${this.closed}`));
    const seq = this.seq;
    this.send({ type: 'request', command, arguments: args ?? {} });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(seq, { command, resolve: resolve as (body: unknown) => void, reject });
    });
  }

  respond(request: Reverse, body: unknown = {}): void {
    this.send({ type: 'response', request_seq: request.seq, success: true, command: request.command, body });
  }

  refuse(request: Reverse, message: string): void {
    this.send({ type: 'response', request_seq: request.seq, success: false, command: request.command, message });
  }

  onEvent(listener: (event: string, body: unknown) => void): () => void {
    this.events.add(listener);
    return () => this.events.delete(listener);
  }

  /** The wire has broken — with a reason. Called once. */
  onClose(listener: (why: string) => void): () => void {
    if (this.closed) {
      listener(this.closed);
      return () => undefined;
    }
    this.closers.add(listener);
    return () => this.closers.delete(listener);
  }

  get alive(): boolean {
    return this.closed === null;
  }

  dispose(): void {
    this.close('disposed');
    this.stream.destroy();
  }

  private send(message: Record<string, unknown>): void {
    const body = Buffer.from(JSON.stringify({ seq: this.seq++, ...message }), 'utf8');
    this.stream.write(Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]));
  }

  private feed(chunk: Uint8Array): void {
    const piece = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    this.buffer = this.buffer.length === 0 ? Buffer.from(piece) : Buffer.concat([this.buffer, piece]);
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;
      const match = /content-length:\s*(\d+)/i.exec(this.buffer.subarray(0, headerEnd).toString('ascii'));
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }
      const start = headerEnd + 4;
      const end = start + Number(match[1]);
      if (this.buffer.length < end) return;
      const text = this.buffer.subarray(start, end).toString('utf8');
      this.buffer = this.buffer.subarray(end);
      let message: unknown;
      try {
        message = JSON.parse(text);
      } catch {
        continue;
      }
      this.dispatch(message as Record<string, unknown>);
    }
  }

  private dispatch(message: Record<string, unknown>): void {
    if (message['type'] === 'response') {
      const pending = this.pending.get(message['request_seq'] as number);
      if (!pending) return;
      this.pending.delete(message['request_seq'] as number);
      if (message['success']) pending.resolve(message['body'] ?? {});
      else pending.reject(new Error(`${pending.command}: ${String(message['message'] ?? 'failed')}`));
    } else if (message['type'] === 'event') {
      for (const listener of this.events) listener(message['event'] as string, message['body'] ?? {});
    } else if (message['type'] === 'request') {
      this.onReverse(message as unknown as Reverse);
    }
  }

  /**
   * The reason for a break is an answer to EVERYONE still waiting: otherwise the
   * interface hangs on a request there is nobody left to answer.
   */
  private close(why: string): void {
    if (this.closed) return;
    this.closed = why;
    for (const pending of this.pending.values()) pending.reject(new Error(`${pending.command}: ${why}`));
    this.pending.clear();
    for (const listener of this.closers) listener(why);
    this.closers.clear();
  }
}
