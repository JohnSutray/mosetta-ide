import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

const CONFIG = fileURLToPath(new URL('./fixtures/lsp-config', import.meta.url));
const LSP = '@ide/plugin-lsp';

interface Diagnostic {
  severity: string;
  message: string;
}
interface FileDiagnostics {
  path: string;
  diagnostics: Diagnostic[];
}
interface PluginEvent {
  name: string;
  event: string;
  payload: unknown;
}

describe('языковой сервер (плагин)', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  const lsp = (method: string, params: unknown = null) => c.call('plugins.call', { name: LSP, method, params });

  beforeAll(async () => {
    root = await makeProject('lsp', {
      'tsconfig.json': JSON.stringify(
        { compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', noEmit: true } },
        null,
        2,
      ),
      'src/bad.ts': 'export const answer: number = "сорок два";\n',
      'src/good.ts': 'export function twice(x: number): number {\n  return x * 2;\n}\n',
    });
    server = await withServer(60_000, CONFIG);
    c = await connect(server);
    await c.call('workspace.open', { root });
  }, 60_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('поднимается при открытии проекта, а не при первом .ts', async () => {
    const deadline = Date.now() + 40_000;
    let status = (await lsp('status')) as Array<{ state: string }>;
    while (status[0]?.state !== 'ready' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      status = (await lsp('status')) as Array<{ state: string }>;
    }
    expect(status[0]?.state, JSON.stringify(status)).toBe('ready');
  }, 45_000);

  it('ошибку в НЕОТКРЫТОМ файле видно сразу (ADR-0132)', async () => {
    const found = await waitForDiagnostics(c, 'src/bad.ts', (d) => d.length > 0);
    expect(found.diagnostics[0]?.severity).toBe('error');
    const known = (await lsp('problems')) as FileDiagnostics[];
    expect(known.some((f) => f.path === 'src/bad.ts')).toBe(true);
  }, 45_000);

  it('ошибка гаснет на НЕСОХРАНЁННОМ тексте — память одолжена, не диск', async () => {
    const doc = await c.call('doc.open', { path: 'src/bad.ts' });
    const waiting = waitForDiagnostics(c, 'src/bad.ts', (d) => d.length === 0);

    await c.call('doc.edit', {
      path: 'src/bad.ts',
      text: 'export const answer: number = 42;\n',
      baseVersion: doc.version,
    });
    const cleared = await waiting;
    expect(cleared.diagnostics).toEqual([]);

    const onDisk = await c.call('fs.read', { path: 'src/bad.ts' });
    expect(onDisk.text).toContain('сорок два');
  }, 45_000);

  it('подсказка приносит сигнатуру', async () => {
    await c.call('doc.open', { path: 'src/good.ts' });
    const hover = (await lsp('hover', { path: 'src/good.ts', line: 0, character: 17 })) as {
      markdown: string;
    } | null;
    expect(hover?.markdown ?? '').toMatch(/twice/);
    expect(hover?.markdown ?? '').toMatch(/number/);
  }, 45_000);
});

function waitForDiagnostics(
  client: TestClient,
  path: string,
  accept: (diagnostics: Diagnostic[]) => boolean,
  timeoutMs = 40_000,
): Promise<FileDiagnostics> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      const events = (client.events('plugins.event') as PluginEvent[])
        .filter((e) => e.name === LSP && e.event === 'diagnostics')
        .map((e) => e.payload as FileDiagnostics);
      const match = [...events].reverse().find((e) => e.path === path && accept(e.diagnostics));
      if (match) return resolve(match);
      if (Date.now() > deadline) {
        return reject(new Error(`не дождались диагностики для ${path}`));
      }
      setTimeout(() => void tick(), 150);
    };
    void tick();
  });
}
