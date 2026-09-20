import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RpcClient } from '../src/rpc/client.js';

/**
 * A tab coming back after a drop.
 *
 * Checking this by hand is impossible: the drop has to be arranged first, and the
 * bfcache (back/forward navigation) only reproduces in a real browser with real
 * history. The conditions, on the other hand, are simple and describable in words —
 * which means they belong in a test.
 */

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

  /** The socket opened. */
  live(): void {
    this.readyState = FakeSocket.OPEN;
    this.fire('open');
  }

  /** The socket died and SAID so — an ordinary drop. */
  die(): void {
    this.readyState = FakeSocket.CLOSED;
    this.fire('close');
  }

  /**
   * The socket died IN SILENCE — which is what coming back from the bfcache looks like:
   * the page revived with its previous JS state, the connection behind it is gone, and
   * nobody sent a `close`.
   */
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

describe('a tab comes back after a drop', () => {
  it('a live socket needs no waking', () => {
    const rpc = connect();
    rpc.revive();
    expect(FakeSocket.born).toHaveLength(1);
    expect(rpc.connected.value).toBe(true);
  });

  it('a socket that died in silence comes up on the way back from the bfcache', () => {
    const rpc = connect();
    FakeSocket.born.at(-1)!.vanish();
    expect(FakeSocket.born).toHaveLength(1);

    for (const handler of page.window.get('pageshow') ?? []) handler({ persisted: true });
    expect(FakeSocket.born).toHaveLength(2);
    FakeSocket.born.at(-1)!.live();
    expect(rpc.connected.value).toBe(true);
  });

  it('an ordinary step through history (without a restore) leaves the tab alone', () => {
    connect();
    for (const handler of page.window.get('pageshow') ?? []) handler({ persisted: false });
    expect(FakeSocket.born).toHaveLength(1);
  });

  it('coming back to the tab and the network returning wake it too', () => {
    for (const event of ['focus', 'online']) {
      FakeSocket.born.length = 0;
      const rpc = connect();
      FakeSocket.born.at(-1)!.vanish();
      for (const handler of page.window.get(event) ?? []) handler({});
      expect(FakeSocket.born, event).toHaveLength(2);
      rpc.dispose();
    }
  });

  it('a tab closed for good does not rise again', () => {
    const rpc = connect();
    rpc.dispose();
    rpc.revive();
    expect(FakeSocket.born).toHaveLength(1);
  });

  it('a drop puts the light out and rejects the calls still in flight', async () => {
    const rpc = connect();
    const call = rpc.call('workspace.list', null);
    FakeSocket.born.at(-1)!.die();
    expect(rpc.connected.value).toBe(false);
    await expect(call).rejects.toThrow();
  });
});
