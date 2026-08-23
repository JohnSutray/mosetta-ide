import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RpcClient } from '../src/rpc/client.js';

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static readonly born: FakeSocket[] = [];

  readyState = FakeSocket.CONNECTING;
  private readonly handlers = new Map<string, Set<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeSocket.born.push(this);
  }

  addEventListener(name: string, handler: (event: unknown) => void): void {
    const set = this.handlers.get(name) ?? new Set();
    set.add(handler);
    this.handlers.set(name, set);
  }

  send(): void {}

  close(): void {
    this.die();
  }

  live(): void {
    this.readyState = FakeSocket.OPEN;
    this.fire('open');
  }

  die(): void {
    this.readyState = FakeSocket.CLOSED;
    this.fire('close');
  }

  vanish(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  private fire(name: string): void {
    for (const handler of this.handlers.get(name) ?? []) handler({});
  }
}

type Listeners = Map<string, Array<(event: unknown) => void>>;

function stubPage(): { window: Listeners; document: Listeners } {
  const window: Listeners = new Map();
  const document: Listeners = new Map();
  const add = (map: Listeners) => (name: string, handler: (event: unknown) => void) => {
    map.set(name, [...(map.get(name) ?? []), handler]);
  };
  Object.assign(globalThis, {
    window: { addEventListener: add(window) },
    document: { addEventListener: add(document), visibilityState: 'visible' },
  });
  return { window, document };
}

let page: { window: Listeners; document: Listeners };

beforeEach(() => {
  FakeSocket.born.length = 0;
  Object.assign(globalThis, { WebSocket: FakeSocket });
  page = stubPage();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

function connect(): RpcClient {
  const rpc = new RpcClient('ws://localhost:0/rpc');
  rpc.connect();
  FakeSocket.born.at(-1)!.live();
  return rpc;
}

describe('вкладка возвращается после обрыва', () => {
  it('живой сокет будить не надо', () => {
    const rpc = connect();
    rpc.revive();
    expect(FakeSocket.born).toHaveLength(1);
    expect(rpc.connected.value).toBe(true);
  });

  it('молча умерший сокет поднимается по возврату из bfcache', () => {
    const rpc = connect();
    FakeSocket.born.at(-1)!.vanish();
    expect(FakeSocket.born).toHaveLength(1);

    for (const handler of page.window.get('pageshow') ?? []) handler({ persisted: true });
    expect(FakeSocket.born).toHaveLength(2);
    FakeSocket.born.at(-1)!.live();
    expect(rpc.connected.value).toBe(true);
  });

  it('обычный переход по истории (без восстановления) вкладку не трогает', () => {
    connect();
    for (const handler of page.window.get('pageshow') ?? []) handler({ persisted: false });
    expect(FakeSocket.born).toHaveLength(1);
  });

  it('возврат к вкладке и появление сети тоже будят', () => {
    for (const event of ['focus', 'online']) {
      FakeSocket.born.length = 0;
      const rpc = connect();
      FakeSocket.born.at(-1)!.vanish();
      for (const handler of page.window.get(event) ?? []) handler({});
      expect(FakeSocket.born, event).toHaveLength(2);
      rpc.dispose();
    }
  });

  it('закрытая совсем вкладка не воскресает', () => {
    const rpc = connect();
    rpc.dispose();
    rpc.revive();
    expect(FakeSocket.born).toHaveLength(1);
  });

  it('обрыв роняет лампочку и отклоняет незавершённые вызовы', async () => {
    const rpc = connect();
    const call = rpc.call('workspace.list', null);
    FakeSocket.born.at(-1)!.die();
    expect(rpc.connected.value).toBe(false);
    await expect(call).rejects.toThrow();
  });
});
