import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@ide/api/testing';
import NpmScripts, { type ScriptInfo } from '../src/client.js';

const NAME = '@ide/plugin-npm-scripts';

const SCRIPTS: ScriptInfo[] = [
  { id: 'core::dev', script: 'dev', command: 'vite', path: 'packages/core' },
  { id: 'core::build', script: 'build', command: 'vite build', path: 'packages/core' },
  { id: 'ui::dev', script: 'dev', command: 'vite', path: 'packages/ui' },
];

function tick(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

describe('скрипты', () => {
  let host: FakeHost;
  let npm: NpmScripts;

  beforeEach(async () => {
    host = new FakeHost();
    npm = host.add(NpmScripts, NAME);
    host.ide(NAME).answers.set('list', () => SCRIPTS);
    host.ide(NAME).answers.set('run', () => ({ id: 'term-1', title: 'core::dev' }));
    await host.start();
  });

  it('@remote уезжает на сервер под именем метода', async () => {
    await npm.refresh();
    expect(host.ide(NAME).calls).toEqual([{ method: 'list', params: undefined }]);
    expect(npm.scripts()).toEqual(SCRIPTS);
  });

  it('@remote с именем зовёт то, что названо', async () => {
    await npm.run('core::dev');
    expect(host.ide(NAME).calls).toEqual([{ method: 'run', params: { id: 'core::dev' } }]);
  });

  it('запуск открывает терминал, а не переизобретает панель', async () => {
    await npm.run('core::dev');
    expect(host.surface.terminals).toEqual([{ id: 'term-1', title: 'core::dev' }]);
  });

  it('отказ сервера не стирает список и не молчит', async () => {
    await npm.refresh();
    host.ide(NAME).answers.set('list', () => {
      throw new Error('пакет не читается');
    });
    await npm.refresh();
    expect(npm.scripts()).toEqual(SCRIPTS);
    expect(host.ide(NAME).said.join('')).toContain('пакет не читается');
  });

  it('команда открывает попап и перечитывает список', async () => {
    expect(host.run('scripts.open')).toBe(true);
    await tick();
    expect(host.ide(NAME).calls.map((one) => one.method)).toEqual(['list']);
    expect(popup()).not.toBeNull();
    host.run('scripts.open');
    expect(popup()).toBeNull();
  });

  it('находку своего сорта открывает сам', async () => {
    const opener = host.ide(NAME).openers.get('npm');
    expect(opener).toBeDefined();
    opener!({ path: 'package.json', id: 'ui::dev' });
    await tick();
    expect(host.ide(NAME).calls).toContainEqual({ method: 'run', params: { id: 'ui::dev' } });
  });

  it('находка без id ничего не запускает', () => {
    host.ide(NAME).openers.get('npm')!({ path: 'package.json' });
    expect(host.ide(NAME).calls).toEqual([]);
  });

  it('пакет — заголовок секции, а не приставка к каждой строке', async () => {
    await npm.refresh();
    host.run('scripts.open');
    const props = popup()!;
    const section = props['section'] as (value: ScriptInfo) => string;
    expect(SCRIPTS.map(section)).toEqual(['core', 'core', 'ui']);
  });

  it('ищется по полному id: «cd» обязано находить core::dev', async () => {
    await npm.refresh();
    host.run('scripts.open');
    const items = popup()!['items'] as Array<{ key: string; text: string }>;
    expect(items.map((one) => one.text)).toEqual(SCRIPTS.map((one) => one.id));
  });

  it('выбор строки запускает и закрывает', async () => {
    await npm.refresh();
    host.run('scripts.open');
    (popup()!['onPick'] as (value: ScriptInfo) => void)(SCRIPTS[2]!);
    await tick();
    expect(host.ide(NAME).calls).toContainEqual({ method: 'run', params: { id: 'ui::dev' } });
    expect(popup()).toBeNull();
  });

  it('состояние — поля экземпляра, а не модульные сигналы', () => {
    const second = new FakeHost();
    second.add(NpmScripts, NAME);
    host.run('scripts.open');
    expect(popup()).not.toBeNull();
    expect(second.ide(NAME).surfaces).toHaveLength(0);
  });

  function popup(): Record<string, unknown> | null {
    const drawn = host.ide(NAME).surfaces[0]!() as { props?: Record<string, unknown> } | null;
    return drawn ? (drawn.props ?? null) : null;
  }
});
