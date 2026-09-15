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
} from '@mosetta/ide-protocol';

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
  readonly daemon: Signal<{ rssMb: number; kidsMb: number | null } | null> = signal(null);

  private socket: WebSocket | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly queue: string[] = [];
  private readonly listeners = new Map<string, Set<(payload: never) => void>>();
  private retry = 0;
  private closed = false;
  private reopenTimer: ReturnType<typeof setTimeout> | null = null;
  private watching = false;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly pulseMs = 15_000;
  private readonly pulseTimeoutMs = 10_000;

  constructor(private readonly url = defaultUrl()) {}

  connect(): void {
    if (this.socket) return;
    this.watchPage();
    this.open();
  }

  revive(): void {
    if (this.closed || this.alive()) return;
    if (this.reopenTimer) {
      clearTimeout(this.reopenTimer);
      this.reopenTimer = null;
    }
    this.retry = 0;
    this.open();
  }

  private alive(): boolean {
    const socket = this.socket;
    if (!socket) return false;
    return socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING;
  }

  private watchPage(): void {
    if (this.watching || typeof window === 'undefined') return;
    this.watching = true;
    window.addEventListener('pageshow', (event) => {
      if ((event as PageTransitionEvent).persisted) this.revive();
    });
    window.addEventListener('online', () => this.revive());
    window.addEventListener('focus', () => this.revive());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.revive();
      });
    }
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
    const mine = () => this.socket === socket;

    socket.addEventListener('open', () => {
      if (!mine()) return socket.close();
      this.retry = 0;
      this.connected.value = true;
      for (const frame of this.queue.splice(0)) socket.send(frame);
      this.startPulse(socket);
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
      if (!mine()) return;
      this.stopPulse();
      this.connected.value = false;
      for (const [, slot] of this.pending) {
        slot.reject(new RpcFailure({ code: RpcErrorCode.ConnectionLost, message: 'Соединение закрыто' }));
      }
      this.pending.clear();
      if (!this.closed) this.scheduleReopen();
    });
  }

  private startPulse(socket: WebSocket): void {
    this.stopPulse();
    this.beat(socket);
    this.heartbeat = setInterval(() => this.beat(socket), this.pulseMs);
  }

  private beat(socket: WebSocket): void {
    {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
      const answered = this.call('server.ping', null).then(
        (said) => {
          this.daemon.value = { rssMb: said.rssMb, kidsMb: said.kidsMb };
          return true;
        },
        () => true,
      );
      const late = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), this.pulseTimeoutMs));
      void Promise.race([answered, late]).then((alive) => {
        if (alive || this.socket !== socket) return;
        socket.close();
      });
    }
  }

  private stopPulse(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private scheduleReopen(): void {
    if (this.reopenTimer) return;
    const delay = Math.min(1000 * 2 ** this.retry++, 5000);
    this.reopenTimer = setTimeout(() => {
      this.reopenTimer = null;
      this.open();
    }, delay);
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
  if (import.meta.env.VITE_IDE_PORT === 'url') {
    const given = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('port');
    return `ws://127.0.0.1:${given ?? DEFAULT_PORT}${WS_PATH}`;
  }
  const fixed = Number(import.meta.env.VITE_IDE_PORT) || 0;
  const devPort = fixed || DEFAULT_PORT;
  if (typeof location === 'undefined') return `ws://127.0.0.1:${devPort}${WS_PATH}`;
  const host = location.hostname || '127.0.0.1';
  const port = fixed || (import.meta.env.DEV ? DEFAULT_PORT : location.port);
  return `ws://${host}:${port}${WS_PATH}`;
}
