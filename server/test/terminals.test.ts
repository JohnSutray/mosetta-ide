import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TerminalInfo } from '@ide/protocol';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('терминалы', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeEach(async () => {
    server = await withServer();
    root = await makeProject('term', {
      'package.json': JSON.stringify({ name: 'root', scripts: { hello: 'echo из скрипта' } }),
      'pnpm-lock.yaml': 'lockfileVersion: 9\n',
      'packages/core/package.json': JSON.stringify({
        name: '@distrojs/core',
        scripts: { dev: 'echo ядро' },
      }),
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  });

  afterEach(async () => {
    await c.close();
    await server.close();
    await removeProject(root);
  });

  it('под терминалом настоящая консоль', async () => {
    await c.call('term.open', { name: 'manual-terminal' });
    await c.call('term.write', { name: 'manual-terminal', data: 'echo живая-консоль\r' });
    const output = await waitForOutput(c, 'manual-terminal', 'живая-консоль');
    expect(output).toContain('живая-консоль');
  }, 20_000);

  it('на имя приходится ровно один терминал', async () => {
    const first = await c.call('term.open', { name: 'manual-terminal' });
    const second = await c.call('term.open', { name: 'manual-terminal' });
    expect(second.pid).toBe(first.pid);
    expect((await c.call('term.list', null)).length).toBe(1);
  }, 20_000);

  it('скрипт запускается в терминале со своим именем', async () => {
    const info = await c.call('npm.run', { id: '@distrojs/core::dev' });
    expect(info.name).toBe('@distrojs/core::dev');
    expect(info.kind).toBe('script');
    expect(info.command).toBe('pnpm run dev');

    const output = await waitForOutput(c, '@distrojs/core::dev', 'ядро');
    expect(output).toContain('ядро');
  }, 20_000);

  it('повторный запуск скрипта попадает в тот же терминал', async () => {
    const first = await c.call('npm.run', { id: 'root::hello' });
    const second = await c.call('npm.run', { id: 'root::hello' });
    expect(second.pid).toBe(first.pid);
    expect((await c.call('term.list', null)).length).toBe(1);
  }, 20_000);

  it('чип показывает короткое имя, а не длинное', async () => {
    const info = await c.call('npm.run', { id: '@distrojs/core::dev' });
    expect(info.title).toBe('core::dev');
    const manual = await c.call('term.open', { name: 'manual-terminal' });
    expect(manual.title).toBe('manual');
  }, 20_000);

  it('переживает уход вкладки и отдаёт накопленный вывод', async () => {
    await c.call('term.open', { name: 'manual-terminal' });
    await c.call('term.write', { name: 'manual-terminal', data: 'echo не-потеряйся\r' });
    await waitForOutput(c, 'manual-terminal', 'не-потеряйся');

    await c.close();
    await new Promise((r) => setTimeout(r, 60));

    const list = server.registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.held.some((reason) => reason.startsWith('terminal:'))).toBe(true);

    c = await connect(server);
    await c.call('workspace.open', { root });
    const attached = await c.call('term.attach', { name: 'manual-terminal' });
    expect(attached.buffer).toContain('не-потеряйся');
  }, 20_000);

  it('закрытие терминала отпускает воркспейс', async () => {
    const info = await c.call('term.open', { name: 'manual-terminal' });
    expect(info.alive).toBe(true);

    await c.call('term.close', { name: 'manual-terminal' });
    expect(await c.call('term.list', null)).toEqual([]);
    expect(server.registry.list()[0]!.held).toEqual([]);
  }, 20_000);

  it('умерший терминал перезапускается под тем же именем', async () => {
    const first = await c.call('term.open', { name: 'manual-terminal' });
    await c.call('term.write', { name: 'manual-terminal', data: 'exit\r' });
    await waitFor(async () => {
      const list = (await c.call('term.list', null)) as TerminalInfo[];
      return list[0]?.alive === false;
    });

    const second = await c.call('term.open', { name: 'manual-terminal' });
    expect(second.alive).toBe(true);
    expect(second.pid).not.toBe(first.pid);
    expect((await c.call('term.list', null)).length).toBe(1);
  }, 20_000);
});

async function waitForOutput(
  client: TestClient,
  name: string,
  needle: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const chunks = client.events('term.data') as Array<{ name: string; data: string }>;
    const text = chunks
      .filter((chunk) => chunk.name === name)
      .map((chunk) => chunk.data)
      .join('');
    if (text.includes(needle)) return text;
    if (Date.now() > deadline) throw new Error(`не дождались «${needle}» в ${name}`);
    await new Promise((r) => setTimeout(r, 60));
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error('не дождались');
    await new Promise((r) => setTimeout(r, 60));
  }
}
