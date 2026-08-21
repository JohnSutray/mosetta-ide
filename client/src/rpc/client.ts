import { signal, type Signal } from '@preact/signals';
import {
  DEFAULT_PORT,
  WS_PATH,
  isError,
  RpcErrorCode,
  isNotification,
  type ApiMethod,
  type EventName,
  type EventPayload,
  type Params,
  type Result,
  type RpcErrorBody,
  type ServerFrame,
} from '@ide/protocol';

export class RpcFailure extends Error {
  constructor(readonly body: RpcErrorBody) {
    super(body.message);
    this.name = 'RpcFailure';
  }
  get code() {
    return this.body.code;
  }
}

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

export class RpcClient {
  readonly connected: Signal<boolean> = signal(false);

  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly queue: string[] = [];
  private readonly listeners = new Map<string, Set<(payload: never) => void>>();
  private retry = 0;
  private closed = false;

  constructor(private readonly url = defaultUrl()) {}

  connect(): void {
    if (this.socket) return;
    this.open();
  }

  call<M extends ApiMethod>(method: M, params: Params<M>): Promise<Result<M>> {
    const id = this.nextId++;
    const frame = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    return new Promise<Result<M>>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(frame);
      else this.queue.push(frame);
    });
  }

  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.listeners.set(event, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  dispose(): void {
    this.closed = true;
    this.socket?.close();
  }

  private open(): void {
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.retry = 0;
      this.connected.value = true;
      for (const frame of this.queue.splice(0)) socket.send(frame);
    });

    socket.addEventListener('message', (event) => {
      let frame: ServerFrame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.dispatch(frame);
    });

    socket.addEventListener('close', () => {
      this.connected.value = false;
      for (const [, slot] of this.pending) {
        slot.reject(new RpcFailure({ code: RpcErrorCode.ConnectionLost, message: 'Соединение закрыто' }));
      }
      this.pending.clear();
      if (!this.closed) this.scheduleReopen();
    });
  }

  private scheduleReopen(): void {
    const delay = Math.min(1000 * 2 ** this.retry++, 5000);
    setTimeout(() => this.open(), delay);
  }

  private dispatch(frame: ServerFrame): void {
    if (isNotification(frame)) {
      for (const handler of this.listeners.get(frame.method) ?? []) {
        (handler as (p: unknown) => void)(frame.params);
      }
      return;
    }
    if (frame.id === null) return;
    const slot = this.pending.get(frame.id);
    if (!slot) return;
    this.pending.delete(frame.id);
    if (isError(frame)) slot.reject(new RpcFailure(frame.error));
    else slot.resolve(frame.result);
  }
}

function defaultUrl(): string {
  if (typeof location === 'undefined') return `ws://127.0.0.1:${DEFAULT_PORT}${WS_PATH}`;
  const host = location.hostname || '127.0.0.1';
  const port = import.meta.env.DEV ? DEFAULT_PORT : location.port;
  return `ws://${host}:${port}${WS_PATH}`;
}
