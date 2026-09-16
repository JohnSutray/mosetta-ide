import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient, withServer } from './helpers.js';

interface Hit {
  kind: string;
  label: string;
  path: string;
  line?: number;
  matches: number[];
}
interface Stats {
  files: number;
  provided: number;
  symbols: number;
  vocabulary: number;
  pending: number;
  unparsed: number;
}
async function search(c: TestClient, params: { query: string; limit?: number; kinds?: string[] }): Promise<Hit[]> {
  return (await answerOf(c, params)).hits;
}
function answerOf(
  c: TestClient,
  params: { query: string; limit?: number; kinds?: string[] },
): Promise<{ hits: Hit[]; total: number }> {
  return c.call('plugins.call', { name: '@mosetta/ide-plugin-search', method: 'search', params }) as Promise<{
    hits: Hit[];
    total: number;
  }>;
}
function indexStats(c: TestClient): Promise<Stats> {
  return c.call('plugins.call', { name: '@mosetta/ide-plugin-search', method: 'stats', params: null }) as Promise<Stats>;
}

describe('поиск всего', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeAll(async () => {
    server = await withServer();
    root = await makeProject('search', {
      'package.json': JSON.stringify({ name: 'root', scripts: { build: 'tsc -b' } }),
      'packages/core/package.json': JSON.stringify({
        name: '@distrojs/core',
        scripts: { dev: 'vite', test: 'vitest run' },
      }),
      'packages/core/src/desktop/creditCardForm.ts': [
        'export const MY_VARIABLE = 1;',
        '',
        'export function DesktopCreditCardForm() {',
        '  return null;',
        '}',
        '',
        'export class Desktop {',
        '  creditCardForm() {}',
        '  title = "x";',
        '}',
        '',
        'export enum EMyRoleEnum {',
        '  role = "role",',
        '}',
        '',
        'export interface Shape {',
        '  area(): number;',
        '}',
        '',
        'export type Alias = string;',
        '',
        'export const arrowThing = () => 1;',
      ].join('\n'),
      'packages/core/src/deviceValueRenderer.ts': 'export const deviceValueRenderer = 1;\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
  }, 30_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('видит свои сорта: файлы и находки поставщиков', async () => {
    const stats = await indexStats(c);
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.provided).toBe(3);
    expect(stats.vocabulary).toBeGreaterThan(5);
    expect(stats.symbols).toBe(0);
  });

  it('потолок режет список, но не число найденного', async () => {
    const all = await answerOf(c, { query: 'ts', limit: 200 });
    expect(all.hits.length).toBe(all.total);

    const few = await answerOf(c, { query: 'ts', limit: 2 });
    expect(few.hits).toHaveLength(2);
    expect(few.total).toBe(all.total);
  });

  it('находит npm-скрипт монорепы по имени пакета и скрипта', async () => {
    const hits = await search(c, { query: '@distrojs/core::dev' });
    expect(labels(hits)[0]).toBe('npm::@distrojs/core::dev');
  });

  it('::dev вытаскивает скрипт, а не переменную с теми же буквами', async () => {
    const hits = await search(c, { query: '::dev' });
    expect(labels(hits)[0]).toBe('npm::@distrojs/core::dev');
  });

  it('npm:: без хвоста показывает все скрипты', async () => {
    const hits = await search(c, { query: 'npm::' });
    expect(labels(hits).sort()).toEqual([
      'npm::@distrojs/core::dev',
      'npm::@distrojs/core::test',
      'npm::root::build',
    ]);
  });
});

function labels(hits: Hit[]): string[] {
  return hits.map((h) => h.label);
}
