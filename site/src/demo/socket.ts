import { DemoDaemon, DemoRefusal, type Snapshot } from './daemon.js';

/** `?trace` in the address prints every call the client makes and what it got back. */
const TRACE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('trace');

/**
 * A `WebSocket` with the demo daemon at the other end instead of a network. Frames are
 * still JSON strings, and every answer arrives on a later task, as it would over a
 * real socket — so the client runs exactly the code it runs against a real daemon.
 */
class DemoSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING;

  constructor(private readonly daemon: DemoDaemon) {
    super();
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.dispatchEvent(new Event('open'));
      this.daemon.connected();
    });
  }

  send(frame: string): void {
    const { id, method, params } = JSON.parse(frame) as { id: number; method: string; params: unknown };
    this.daemon.handle(method, params).then(
      (result) => {
        if (TRACE) console.debug('demo daemon:', method, params, '→', result);
        this.deliver({ jsonrpc: '2.0', id, result: result ?? null });
      },
      (err: unknown) => {
        if (TRACE) console.debug('demo daemon:', method, params, '✗', err);
        this.deliver({
          jsonrpc: '2.0',
          id,
          error: {
            code: err instanceof DemoRefusal ? err.code : -32603,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      },
    );
  }

  close(): void {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  deliver(frame: unknown): void {
    if (this.readyState === WebSocket.CLOSED) return;
    const data = JSON.stringify(frame);
    setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data })));
  }
}

/**
 * One daemon per embedded IDE, however many times the client reconnects: a reconnect
 * gets the same files, terminals and git state back, the way it does from the real one.
 */
export function demoDial(snapshot: Snapshot): { dial: () => WebSocket; daemon: DemoDaemon } {
  let current: DemoSocket | null = null;
  const daemon = new DemoDaemon(snapshot, (method, params) => current?.deliver({ jsonrpc: '2.0', method, params }));
  return {
    daemon,
    dial: () => {
      current = new DemoSocket(daemon);
      return current as unknown as WebSocket;
    },
  };
}
