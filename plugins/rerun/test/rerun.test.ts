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

describe('re-running the last script', () => {
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
      name: 'a script',
      command: 'pnpm run dev',
      cwd: '.',
    }));
    host.ide('@mosetta/ide-plugin-terminal').answers.set('open', () => ({
      name: 'a script',
      title: 'a script',
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

  it('a neighbour is found by class rather than by name', () => {
    expect(host.plugin(NpmScripts)).toBe(npm);
  });

  it('exactly what the neighbour made public is visible', () => {
    // @ts-expect-error
    void npm.list;
    // @ts-expect-error
    void npm.ide;
    expect(typeof npm.run).toBe('function');
    expect(typeof npm.scripts).toBe('function');
    expect(typeof npm.refresh).toBe('function');
  });

  it('nothing to re-run — it says so out loud', () => {
    host.run('scripts.rerun');
    expect(host.ide(RERUN).said).toEqual(['rerun.nothing']);
    expect(host.ide(NPM).calls).toEqual([]);
  });

  it('the first time it takes the first script it knows', async () => {
    await npm.refresh();
    host.run('scripts.rerun');
    await tick();
    expect(host.ide(NPM).calls).toContainEqual({ method: 'run', params: { id: 'core::dev' } });
  });

  it('after that it repeats exactly that one', async () => {
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

  it('somebody else\'s memory is rearranged from outside', async () => {
    await npm.refresh();
    host.plugin(Rerun).remember('ui::test');
    host.run('scripts.rerun');
    await tick();
    expect(host.ide(NPM).calls).toContainEqual({ method: 'run', params: { id: 'ui::test' } });
  });

  it('the order of activation does not decide', async () => {
    const other = new FakeHost();
    other.add(Rerun, RERUN);
    const late = other.add(NpmScripts, NPM);
    await other.start();
    expect(other.plugin(NpmScripts)).toBe(late);
    other.run('scripts.rerun');
    expect(other.ide(RERUN).said).toEqual(['rerun.nothing']);
  });
});
