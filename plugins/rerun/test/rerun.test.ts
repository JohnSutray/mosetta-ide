import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import NpmScripts, { type ScriptInfo } from '@mosetta/ide-plugin-npm-scripts';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import Rerun from '../src/client.js';

const NPM = '@mosetta/ide-plugin-npm-scripts';
const RERUN = '@mosetta/ide-plugin-rerun';

const SCRIPTS: ScriptInfo[] = [
  { id: 'core::dev', script: 'dev', command: 'vite', path: 'packages/core' },
  { id: 'ui::test', script: 'test', command: 'vitest', path: 'packages/ui' },
];

function tick(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

describe('перезапуск последнего скрипта', () => {
  let host: FakeHost;
  let npm: NpmScripts;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(TerminalPlugin, '@mosetta/ide-plugin-terminal');
    host.ide('@mosetta/ide-plugin-terminal').answers.set('list', () => []);
    npm = host.add(NpmScripts, NPM);
    host.add(Rerun, RERUN);
    host.ide(NPM).answers.set('list', () => SCRIPTS);
    host.ide(NPM).answers.set('run', () => ({
      name: 'скрипт',
      command: 'pnpm run dev',
      cwd: '.',
    }));
    host.ide('@mosetta/ide-plugin-terminal').answers.set('open', () => ({
      name: 'скрипт',
      title: 'скрипт',
      kind: 'script',
      pid: 1,
      cols: 80,
      rows: 24,
      alive: true,
      busy: false,
      createdAt: 0,
    }));
    await host.start();
  });

  it('сосед находится по классу, а не по имени', () => {
    expect(host.plugin(NpmScripts)).toBe(npm);
  });

  it('видно ровно то, что сосед объявил публичным', () => {
    // @ts-expect-error
    void npm.list;
    // @ts-expect-error
    void npm.ide;
    expect(typeof npm.run).toBe('function');
    expect(typeof npm.scripts).toBe('function');
    expect(typeof npm.refresh).toBe('function');
  });

  it('нечего перезапускать — говорит вслух', () => {
    hod).toEqual(['rerun.nothing']);
    expect(host.ide(NPM).calls).toEqual([]);
  });

  it('первый раз берёт первый известный скрипт', async () => {
    await npm.refresh();
    host.run('scripts.rerun');
    await tick();
    expect(host.ide(NPM).calls).toContainEqual({ method: 'run', params: { id: 'core::dev' } });
  });

  it('дальше повторяет ровно его', async () => {
    await npm.refresh();
    host.run('scripts.rerun');
    host.run('scripts.rerun');
    await tick();
    const ran = host.ide(NPM).calls.filter((one) => one.method === 'run');
    expect(ran).toEqual([
      { method: 'run', params: { id: 'core::dev' } },
      { method: 'run', params: { id: 'core::dev' } },
    ]);
  });

  it('чужая память переставляется снаружи', async () => {
:test');
    host.run('scripts.rerun');
    await tick();
    expect(host.ide(NPM).calls).toContainEqual({ method: 'run', params: { id: 'ui::test' } });
  });

  it('порядок активации не решает', async () => {
