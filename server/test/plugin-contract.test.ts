import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_PROVIDED, ContractNames, SharedModules } from '../src/plugins/shared.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const api = path.resolve(here, '../../plugins/api/src');
const names = new ContractNames();

function source(file: string): string {
  return fs.readFileSync(path.join(api, file), 'utf8');
}

function surfaceMembers(text: string): string[] {
  const at = text.indexOf('export interface IdeServices');
  const body = text.slice(text.indexOf('{', at) + 1, text.indexOf('\n}', at));
  return [...body.matchAll(/^\s*(?:readonly\s+)?(\w+):/gm)].map((m) => m[1]!);
}

function clientTable(): string[] {
  const text = fs.readFileSync(path.resolve(here, '../../client/src/state/shared-modules.ts'), 'utf8');
  const body = text.slice(text.indexOf('= {'));
  return [...body.matchAll(/^\s*(?:'([^']+)'|(\w+))(?:: \w+)?,$/gm)].map((m) => m[1] ?? m[2]!);
}

describe('контракт @ide/api', () => {
  it('имён без кода в контракте нет: службы — поля ide (ADR-0206)', () => {
    expect(names.injected(source('client.ts'))).toEqual([]);
    expect(surfaceMembers(source('client.ts'))).toContain('t');
  });

  it('хостовое наружу не отдаётся', () => {
    for (const file of ['client.ts', 'server.ts'] as const) {
      const text = source(file);
      const offered = new Set(names.offered(text));
      for (const m of names.forHost(text).matchAll(/^export (?:abstract class|function) (\w+)/gm)) {
        expect(offered, `${m[1]} — для хоста, плагину он приедет пустым`).not.toContain(m[1]);
      }
    }
  });

  it('серверный контракт отдаёт то, чем плагин пользуется', () => {
    expect(names.offered(source('server.ts')).sort()).toEqual(['activate', 'command']);
  });

  it('взятое взаймы помечено, и список закрытый', () => {
    const BORROWED: string[] = [];
    const marked = surfaceMembers(source('client.ts')).filter((name) => name.startsWith('unstable_'));
    expect(marked.sort()).toEqual(BORROWED.sort());
  });

  it('клиент кладёт на стол ровно то, для чего сервер делает заглушки', () => {
    const server = CORE_PROVIDED.filter((one) => one !== '@ide/api/client');
    expect([...clientTable()].sort()).toEqual([...server].sort());
  });

  it('экспорты пакета спрашиваются у esbuild, а не переписываются руками', async () => {
    const shared = new SharedModules(path.resolve(here, '..'), path.resolve(here, '../../client'));
    const windows = await shared.exportsOf('@ide/windows', 'client');
    for (const name of ['Windows', 'Popups', 'Tips', 'Geometry', 'NOBODY']) {
      expect(windows, `@ide/windows: нет ${name}`).toContain(name);
    }
    const hooks = await shared.exportsOf('preact/hooks', 'client');
    expect(hooks).toContain('useState');
    const view = await shared.exportsOf('@codemirror/view', 'client');
    expect(view).toContain('EditorView');
  });

  it('заглушка читает со стола и падает именем, если стол пуст', async () => {
    const shared = new SharedModules(path.resolve(here, '..'), path.resolve(here, '../../client'));
    shared.register('@ide/plugin-x', 'client', ['default', 'thing']);
    const text = await shared.shim('@ide/plugin-x', 'client');
    expect(text).toContain(`globalThis.__ideApi.modules["@ide/plugin-x"]`);
    expect(text).toContain('export default m.default;');
    expect(text).toContain('export const thing = m["thing"];');
    expect(text).toContain('не поднят');
    const api = await shared.exportsOf('@ide/api/client', 'client');
    expect(api).toContain('useT');
    expect(api).not.toContain('t');
    expect(api).toContain('registry');
    expect(api).not.toContain('attach');
  });
});
