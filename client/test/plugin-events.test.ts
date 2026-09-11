import { describe, expect, it } from 'vitest';
import type { EventName, EventPayload } from '@ide/protocol';
import { Plugins } from '../src/state/plugins.js';
import type { RpcLike } from '../src/state/session.js';

class FakeSocket implements RpcLike {
  private readonly listeners = new Map<string, Set<(payload: never) => void>>();

  call = async (): Promise<never> => {
    throw new Error('в этом тесте на сервер не ходят');
  };

  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler as (payload: never) => void);
    this.listeners.set(event, set);
    return () => set.delete(handler as (payload: never) => void);
  }

  send(name: string, event: string, payload: unknown): void {
    for (const handler of [...(this.listeners.get('plugins.event') ?? [])]) {
      (handler as (p: unknown) => void)({ name, event, payload });
    }
  }

  get subscriptions(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

describe('события плагинов', () => {
  it('плагин слышит своё', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket).bound('@ide/plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@ide/plugin-terminal', 'data', { name: 'root::dev', data: 'привет' });
    expect(heard).toEqual([{ name: 'root::dev', data: 'привет' }]);
  });

  it('чужого плагина не слышит', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket).bound('@ide/plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@ide/plugin-git', 'data', 'чужое');
    expect(heard).toEqual([]);
  });

  it('чужое событие своего плагина не слышит', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    new Plugins(socket).bound('@ide/plugin-terminal').on('data', (p) => heard.push(p));

    socket.send('@ide/plugin-terminal', 'exit', { exitCode: 0 });
    expect(heard).toEqual([]);
  });

  it('два слушателя одного события слышат оба', () => {
    const socket = new FakeSocket();
    const ide = new Plugins(socket).bound('@ide/plugin-terminal');
    const heard: string[] = [];
    ide.on('data', () => heard.push('первый'));
    ide.on('data', () => heard.push('второй'));

    socket.send('@ide/plugin-terminal', 'data', null);
    expect(heard).toEqual(['первый', 'второй']);
  });

  it('отписка отписывает', () => {
    const socket = new FakeSocket();
    const heard: unknown[] = [];
    const off = new Plugins(socket)
      .bound('@ide/plugin-terminal')
      .on('data', (p) => heard.push(p));

    expect(socket.subscriptions).toBe(1);
    off();
    expect(socket.subscriptions).toBe(0);

    socket.send('@ide/plugin-terminal', 'data', 'после отписки');
    expect(heard).toEqual([]);
  });

  it('две IDE в одной вкладке не делят подписки', () => {
    const first = new FakeSocket();
    const second = new FakeSocket();
    const heard: string[] = [];
    new Plugins(first).bound('@ide/plugin-terminal').on('data', () => heard.push('первая'));
    new Plugins(second).bound('@ide/plugin-terminal').on('data', () => heard.push('вторая'));

    first.send('@ide/plugin-terminal', 'data', null);
    expect(heard).toEqual(['первая']);
  });
});
