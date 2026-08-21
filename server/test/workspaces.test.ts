import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

describe('воркспейсы', () => {
  let server: RunningServer;
  let alpha: string;
  let beta: string;
  const clients: TestClient[] = [];

  beforeEach(async () => {
    server = await withServer();
    alpha = await makeProject('alpha', { 'src/main.ts': 'const a = 1;\n', 'readme.md': 'alpha\n' });
    beta = await makeProject('beta', { 'src/main.ts': 'const b = 2;\n' });
  });

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((c) => c.close()));
    await server.close();
    await removeProject(alpha);
    await removeProject(beta);
  });

  async function client() {
    const c = await connect(server);
    clients.push(c);
    return c;
  }

  it('две вкладки держат два проекта и не путают данные', async () => {
    const one = await client();
    const two = await client();

    await one.call('workspace.open', { root: alpha });
    await two.call('workspace.open', { root: beta });

    const fromAlpha = await one.call('fs.read', { path: 'src/main.ts' });
    const fromBeta = await two.call('fs.read', { path: 'src/main.ts' });

    expect(fromAlpha.text).toBe('const a = 1;\n');
    expect(fromBeta.text).toBe('const b = 2;\n');

    await expect(two.call('fs.read', { path: 'readme.md' })).rejects.toMatchObject({
      code: 1004,
    });
  });

  it('один и тот же корень в двух вкладках — один воркспейс', async () => {
    const one = await client();
    const two = await client();

    const a = await one.call('workspace.open', { root: alpha });
    const b = await two.call('workspace.open', { root: alpha });

    expect(b.id).toBe(a.id);
    expect(server.registry.list()).toHaveLength(1);
    expect(b.sessions).toBe(2);
  });

  it('смена проекта меняет то, откуда читаем, тем же кодом', async () => {
    const c = await client();
    await c.call('workspace.open', { root: alpha });
    expect((await c.call('fs.read', { path: 'src/main.ts' })).text).toBe('const a = 1;\n');

    const betaInfo = await c.call('workspace.open', { root: beta });
    await c.call('workspace.attach', { id: betaInfo.id });
    expect((await c.call('fs.read', { path: 'src/main.ts' })).text).toBe('const b = 2;\n');

    expect((await c.call('workspace.current', null))?.id).toBe(betaInfo.id);
  });

  it('без прикреплённого воркспейса проектные методы отказывают внятно', async () => {
    const c = await client();
    const err = await c.expectError('fs.list', { path: '' });
    expect(err.code).toBe(1001);
  });

  it('воркспейс переживает закрытие вкладки, если его держат', async () => {
    const one = await client();
    const info = await one.call('workspace.open', { root: alpha });

    const ws = server.registry.get(info.id)!;
    const release = ws.hold('terminal:manual-terminal');

    await one.close();
    clients.length = 0;
    await new Promise((r) => setTimeout(r, 50));

    expect(server.registry.get(info.id)).toBeDefined();
    expect(server.registry.get(info.id)!.holdReasons).toContain('terminal:manual-terminal');

    release();
  });

  it('ресурсы проекта создаются один раз и умирают вместе с ним', async () => {
    const c = await client();
    const info = await c.call('workspace.open', { root: alpha });
    const ws = server.registry.get(info.id)!;

    let disposed = 0;
    const make = () => ({ value: 'lsp', dispose: () => void disposed++ });
    const first = ws.use('lsp', make);
    const second = ws.use('lsp', make);
    expect(second).toBe(first);

    await server.registry.close(info.id);
    expect(disposed).toBe(1);
  });

  it('простаивающий воркспейс закрывается по таймауту', async () => {
    const short = await withServer(30);
    const c = await connect(short);
    const info = await c.call('workspace.open', { root: alpha });
    await c.close();

    await new Promise((r) => setTimeout(r, 200));
    expect(short.registry.get(info.id)).toBeUndefined();
    await short.close();
  });

  it('список проектов приезжает событием', async () => {
    const one = await client();
    const two = await client();

    const waiting = two.nextEvent('workspace.list');
    await one.call('workspace.open', { root: alpha });
    const list = (await waiting) as Array<{ root: string }>;
    expect(list.some((w) => w.root === alpha)).toBe(true);
  });
});
