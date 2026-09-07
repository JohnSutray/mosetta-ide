import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient, waitFor, withServer } from './helpers.js';

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
}
function search(c: TestClient, params: { query: string; limit?: number; kinds?: string[] }): Promise<Hit[]> {
  return c.call('plugins.call', { name: '@ide/plugin-search', method: 'search', params }) as Promise<Hit[]>;
}
function indexStats(c: TestClient): Promise<Stats> {
  return c.call('plugins.call', { name: '@ide/plugin-search', method: 'stats', params: null }) as Promise<Stats>;
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
    await waitForSymbols(c);
  }, 30_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('видит все три сорта', async () => {
    const stats = await indexStats(c);
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.provided).toBe(3);
    expect(stats.symbols).toBeGreaterThan(8);
    expect(stats.vocabulary).toBeGreaterThan(5);
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

  it('разбирает функции, классы, методы, енумы, типы и стрелки', async () => {
    const all = await search(c, { query: 'ts::', limit: 200 });
    const found = labels(all);
    expect(found).toContain('ts::DesktopCreditCardForm()');
    expect(found).toContain('ts::MY_VARIABLE');
    expect(found).toContain('ts::Desktop');
    expect(found).toContain('ts::Desktop.creditCardForm()');
    expect(found).toContain('ts::Desktop.title');
    expect(found).toContain('ts::EMyRoleEnum.role');
    expect(found).toContain('ts::Shape.area()');
    expect(found).toContain('ts::Alias');
    expect(found).toContain('ts::arrowThing()');
  });

  it('dccf ловит и символ, и файл, и метод', async () => {
    const found = labels(await search(c, { query: 'dccf' }));
    expect(found).toContain('ts::DesktopCreditCardForm()');
    expect(found).toContain('packages/core/src/desktop/creditCardForm.ts');
    expect(found).toContain('ts::Desktop.creditCardForm()');
  });

  it('русская раскладка находит то же, что английская', async () => {
    const wrong = labels(await search(c, { query: 'всса' }));
    expect(wrong).toContain('ts::DesktopCreditCardForm()');

    const narrowed = await search(c, { query: 'ts::всса' });
    expect(narrowed.every((h) => h.kind === 'ts')).toBe(true);
    expect(labels(narrowed)[0]).toBe('ts::DesktopCreditCardForm()');
  });

  it('ts::dccf сужает до символов', async () => {
    const hits = await search(c, { query: 'ts::dccf' });
    expect(hits.every((h) => h.kind === 'ts')).toBe(true);
    expect(labels(hits)[0]).toBe('ts::DesktopCreditCardForm()');
  });

  it('символ знает, где он лежит', async () => {
    const hit = (await search(c, { query: 'ts::EMyRoleEnum.role' }))[0]!;
    expect(hit.path).toBe('packages/core/src/desktop/creditCardForm.ts');
    expect(hit.line).toBe(12);
  });

  it('подсветка указывает на настоящие буквы', async () => {
    const hit = (await search(c, { query: 'dccf', kinds: ['ts'] }))[0]!;
    expect(hit.matches.map((i) => hit.label[i])).toEqual(['D', 'C', 'C', 'F']);
  });

  it('новый символ появляется после правки файла', async () => {
    const path = 'packages/core/src/deviceValueRenderer.ts';
    const doc = await c.call('doc.open', { path });
    await c.call('doc.edit', {
      path,
      text: `${doc.text}\nexport function свежаяФункция() {}\n`,
      baseVersion: doc.version,
    });
    await c.call('doc.save', { path });
    await waitForSymbols(c);

    const found = labels(await search(c, { query: 'свежая' }));
    expect(found).toContain('ts::свежаяФункция()');
  });
});

function labels(hits: Hit[]): string[] {
  return hits.map((h) => h.label);
}

function waitForSymbols(client: TestClient): Promise<void> {
  return waitFor(
    async () => {
      const stats = await indexStats(client);
      return stats.pending === 0 && stats.symbols > 0;
    },
    'символы разобрались',
    20_000,
  );
}
