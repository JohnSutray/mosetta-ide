import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, type TestClient, waitFor, withServer } from './helpers.js';

/**
 * TypeScript symbols are a plugin of their own.
 *
 * A distribution test: we go through the plugin door, as with the index, and the
 * parsing happens in a REAL child process — which is what the whole thing was for. The
 * match score is assigned by the client's search matcher, so what is checked here is
 * what the server does: what was parsed, what was not, and why.
 */

interface SymbolHit {
  label: string;
  path: string;
  line: number;
  kind: string;
}

const NAME = '@mosetta/ide-plugin-symbols';

function find(c: TestClient, query: string, limit = 200, kinds?: string[]): Promise<SymbolHit[]> {
  return c.call('plugins.call', { name: NAME, method: 'find', params: { query, limit, kinds } }) as Promise<SymbolHit[]>;
}
function stats(c: TestClient): Promise<{ symbols: number; uncovered: number }> {
  return c.call('plugins.call', { name: NAME, method: 'stats', params: null }) as Promise<{
    symbols: number;
    uncovered: number;
  }>;
}

describe('the project\'s symbols', () => {
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
    await waitFor(async () => (await stats(c)).symbols > 0, 'the symbols were parsed', 30_000);
  }, 60_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('parses functions, classes, methods, properties, enums, types and arrows', async () => {
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

  it('a symbol knows where it lies', async () => {
    const hit = (await find(c, 'DesktopCreditCardForm'))[0]!;
    expect(hit.path).toBe('src/desktop.ts');
    expect(hit.line).toBe(0);
  });

  it('a directory outside the walk is not parsed at all', async () => {
    expect(await find(c, 'hiddenByNoScan')).toEqual([]);
  });

  it('an empty query means "show me what there is"', async () => {
    const some = await find(c, '   ', 5);
    expect(some).toHaveLength(5);
  });

  it('the kinds are filtered by the cache rather than by whoever asked', async () => {
    const classes = await find(c, '', 20, ['class']);
    expect(classes.length).toBeGreaterThan(0);
    expect(classes.every((one) => one.kind === 'class'), 'classes only').toBe(true);
    const named = await find(c, 'Desktop', 20, ['class']);
    expect(named.every((one) => one.kind === 'class')).toBe(true);
    expect(named.map((one) => one.label)).toContain('Desktop');
  });

  it('a new symbol appears after the file is edited', async () => {
    const path = 'src/desktop.ts';
    const doc = await c.call('doc.open', { path });
    await c.call('doc.edit', {
      path,
      text: `${doc.text}\nexport function freshFunction() {}\n`,
      baseVersion: doc.version,
    });
    await c.call('doc.save', { path });
    await waitFor(async () => (await find(c, 'fresh')).length > 0, 'the fresh symbol was parsed', 30_000);
    expect((await find(c, 'fresh'))[0]?.label).toBe('freshFunction');
  }, 60_000);
});
