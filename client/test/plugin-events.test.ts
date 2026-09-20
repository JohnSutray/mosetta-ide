import { describe, expect, it } from 'vitest';
import type { EventName, EventPayload } from '@mosetta/ide-protocol';
import { Plugins, type PluginDeps } from '../src/state/plugins.js';
import { Memory } from '../src/state/persist.js';
import type { RpcLike } from '../src/state/session.js';

/** What the plugins' home takes from the tab's root: empty ones, here. */
const deps = (): PluginDeps => ({
  commands: { registerPlugin: () => {} },
  notes: { say: () => {}, complain: () => {}, notify: () => 0, settle: () => 0 },
  memory: new Memory(),
  i18n: { add: () => {}, defaults: () => {} },
});

/** A decoy socket: it remembers subscriptions and can deliver an event. */
class FakeSocket implements RpcLike {
  private readonly listeners = new Map<string, Set<(payload: never) => void>>();

  call = async (): Promise<never> => {
    throw new Error('this test never goes to the server');
  };

  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.listeners.set(event, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  /** Deliver what the server would have delivered. */
  send(name: string, event: string, payload: unknown): void {
    for (const handler of [...(this.listeners.get('plugins.event') ?? [])]) {
      (handler as (p: unknown) => void)({ name, event, payload });
    }
  }

  /** How many subscriptions are up: this is how one sees whether anyone unsubscribed. */
  get subscriptions(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

describe('plugin events', () => {
  it('a plugin hears its own', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket, deps()).bound('@mosetta/ide-plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@mosetta/ide-plugin-terminal', 'data', { name: 'root::dev', data: 'hello' });
    expect(heard).toEqual([{ name: 'root::dev', data: 'hello' }]);
  });

  it('does not hear another plugin\'s', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket, deps()).bound('@mosetta/ide-plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@mosetta/ide-plugin-git', 'data', 'somebody else\'s');
    expect(heard).toEqual([]);
  });

  it('does not hear another event of its own plugin', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket, deps()).bound('@mosetta/ide-plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@mosetta/ide-plugin-terminal', 'exit', { exitCode: 0 });
    expect(heard).toEqual([]);
  });

  it('two listeners of one event both hear it', () => {
    const socket = new FakeSocket();
    const ide = new Plugins(socket, deps()).bound('@mosetta/ide-plugin-terminal');
    const heard: string[] = [];
    ide.on('data', () => heard.push('first'));
    ide.on('data', () => heard.push('second'));

    socket.send('@mosetta/ide-plugin-terminal', 'data', null);
    expect(heard).toEqual(['first', 'second']);
  });

  it('unsubscribing unsubscribes', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    const off = new Plugins(socket, deps())
      .bound('@mosetta/ide-plugin-terminal')
      .on('data', (p) => heard.push(p));

    expect(socket.subscriptions).toBe(1);
    off();
    expect(socket.subscriptions).toBe(0);

    socket.send('@mosetta/ide-plugin-terminal', 'data', 'after unsubscribing');
    expect(heard).toEqual([]);
  });

  it('two IDEs in one tab do not share subscriptions', () => {
    const first = new FakeSocket();
    const second = new FakeSocket();
    const heard: string[] = [];
    new Plugins(first, deps()).bound('@mosetta/ide-plugin-terminal').on('data', () => heard.push('first'));
    new Plugins(second, deps()).bound('@mosetta/ide-plugin-terminal').on('data', () => heard.push('second'));

    first.send('@mosetta/ide-plugin-terminal', 'data', null);
    expect(heard).toEqual(['first']);
  });
});
