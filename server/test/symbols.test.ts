import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient, waitFor, withServer } from './helpers.js';

interface SymbolHit {
  label: string;
  path: string;
  line: number;
  kind: string;
}

const NAME = '@mosetta/ide-plugin-symbols';

function find(c: TestClient, query: string, limit = 200): Promise<SymbolHit[]> {
  return c.call('plugins.call', { name: NAME, method: 'find', params: { query, limit } }) as Promise<SymbolHit[]>;
}
function stats(c: TestClient): Promise<{ symbols: number; uncovered: number }> {
  return c.call('plugins.call', { name: NAME, method: 'stats', params: null }) as Promise<{
    symbols: number;
    uncovered: number;
  }>;
}

describe('символы проекта', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  beforeAll(async () => {
    server = await withServer(60_000);
    root = await makeProject('symbols', {
      'package.json': '{ "name": "sym" }\n',
      'src/desktop.ts': [
        'export function DesktopCreditCardForm() {}',
        'export const MY_VARIABLE = 1;',
        'export class Desktop {',
        '  title = "hi";',
        '  creditCardForm() {}',
        '}',
        'export enum EMyRole { role = "r" }',
        'export interface Shape { area(): number }',
        'export type Alias = string;',
        'export const arrowThing = () => 1;',
      ].join('\n'),
      'node_modules/lib/index.ts': 'export function hiddenByNoScan() {}\n',
    });
    c = await connect(server);
    await c.call('workspace.open', { root });
    await waitFor(async () => (await stats(c)).symbols > 0, 'символы разобрались', 30_000);
  }, 60_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('разбирает функции, классы, методы, свойства, енумы, типы и стрелки', async () => {
    const all = (await find(c, 'e')).concat(await find(c, 'a')).map((one) => `${one.kind}:${one.label}`);
    const has = (what: string) => expect(all, what).toContain(what);
    has('function:DesktopCreditCardForm');
    has('variable:MY_VARIABLE');
    has('class:Desktop');
    has('property:Desktop.title');
    has('method:Desktop.creditCardForm()');
    has('enum:EMyRole');
    has('enum-member:EMyRole.role');
    has('interface:Shape');
    has('method:Shape.area()');
    has('type:Alias');
    has('variable:arrowThing');
  });

  it('символ знает, где он лежит', async () => {
    const hit = (await find(c, 'DesktopCreditCardForm'))[0]!;
    expect(hit.path).toBe('src/desktop.ts');
    expect(hit.line).toBe(0);
  });

  it('папка вне обхода не разбирается вовсе', async () => {
    expect(await find(c, 'hiddenByNoScan')).toEqual([]);
  });

  it('пустой запрос ничего не находит и не делает вид, что нашёл', async () => {
    expect(await find(c, '   ')).toEqual([]);
  });

  it('новый символ появляется после правки файла', async () => {
    const path = 'src/desktop.ts';
    const doc = await c.call('doc.open', { path });
    await c.call('doc.edit', {
      path,
      text: `${doc.text}\nexport function свежаяФункция() {}\n`,
      baseVersion: doc.version,
    });
    await c.call('doc.save', { path });
    await waitFor(async () => (await find(c, 'свежая')).length > 0, 'свежий символ разобран', 30_000);
    expect((await find(c, 'свежая'))[0]?.label).toBe('свежаяФункция');
  }, 60_000);
});
