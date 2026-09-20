import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import NpmScripts, { type ScriptInfo } from '../src/client.js';
import TerminalPlugin from '@mosetta/ide-plugin-terminal';
import type { Opener } from '@mosetta/ide-plugin-search';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * Scripts: a plugin with TWO halves.
 *
 * What is checked here is what is invisible both from the core and to the eye: that
 * `@remote` really turns a method call into a conversation with the server, under the
 * name the server expects it by. The stub shouts when the decorator did not apply — but
 * it shouts at runtime, at a human, rather than here.
 */

const NAME = '@mosetta/ide-plugin-npm-scripts';

const SCRIPTS: ScriptInfo[] = [
  { id: 'core::dev', script: 'dev', command: 'vite', path: 'packages/core' },
  { id: 'core::build', script: 'build', command: 'vite build', path: 'packages/core' },
  { id: 'ui::dev', script: 'dev', command: 'vite', path: 'packages/ui' },
];

function tick(): Promise<void> {
  return new Promise((done) => setTimeout(done, 0));
}

describe('scripts', () => {
  let host: FakeHost;
  let npm: NpmScripts;
  let terminal: TerminalPlugin;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(UiPlugin, '@mosetta/ide-plugin-ui');
    terminal = host.add(TerminalPlugin, '@mosetta/ide-plugin-terminal');
    host.ide('@mosetta/ide-plugin-terminal').answers.set('list', () => []);
    host.ide('@mosetta/ide-plugin-terminal').answers.set('shells', () => []);
    npm = host.add(NpmScripts, NAME);
    host.ide(NAME).answers.set('list', () => SCRIPTS);
    host.ide(NAME).answers.set('run', () => ({
      name: 'core::dev',
      command: 'pnpm run dev',
      cwd: 'packages/core',
    }));
    host.ide('@mosetta/ide-plugin-terminal').answers.set('open', (p) => ({
      name: (p as { name: string }).name,
      title: (p as { name: string }).name,
      kind: 'script',
      pid: 42,
      cols: 80,
      rows: 24,
      alive: true,
      busy: false,
      createdAt: 0,
    }));
    await host.start();
  });

  it('@remote goes to the server under the method\'s name', async () => {
    await npm.refresh();
    expect(host.ide(NAME).calls).toEqual([{ method: 'list', params: undefined }]);
    expect(npm.scripts()).toEqual(SCRIPTS);
  });

  it('@remote with a name calls what it was named', async () => {
    await npm.run('core::dev');
    expect(host.ide(NAME).calls).toEqual([{ method: 'run', params: { id: 'core::dev' } }]);
  });

  it('running opens a terminal by SOMEBODY ELSE\'S hands', async () => {
    expect(terminal.showing()).toBe(null);
    await npm.run('core::dev');
    expect(terminal.showing()).toBe('core::dev');
  });

  it('the server\'s refusal neither erases the list nor stays silent', async () => {
    await npm.refresh();
    host.ide(NAME).answers.set('list', () => {
      throw new Error('the package does not read');
    });
    await npm.refresh();
    expect(npm.scripts()).toEqual(SCRIPTS);
    expect(host.ide(NAME).said.join('')).toContain('the package does not read');
  });

  it('the command opens the popup and re-reads the list', async () => {
    expect(host.run('scripts.open')).toBe(true);
    await tick();
    expect(host.ide(NAME).calls.map((one) => one.method)).toEqual(['list']);
    expect(popup()).not.toBeNull();
    host.run('scripts.open');
    expect(popup()).toBeNull();
  });

  it('a hit of its own kind it opens itself', async () => {
    const opener = host.registry.all<Opener>('search.opener').find((one) => one.kind === 'npm');
    expect(opener).toBeDefined();
    opener!.open({ path: 'package.json', id: 'ui::dev' });
    await tick();
    expect(host.ide(NAME).calls).toContainEqual({ method: 'run', params: { id: 'ui::dev' } });
  });

  it('a hit without an id runs nothing', () => {
    host.registry.all<Opener>('search.opener').find((one) => one.kind === 'npm')!.open({ path: 'package.json' });
    expect(host.ide(NAME).calls).toEqual([]);
  });

  it('the package is a section heading rather than a prefix on every row', async () => {
    await npm.refresh();
    host.run('scripts.open');
    const props = popup()!;
    const section = props['section'] as (value: ScriptInfo) => string;
    expect(SCRIPTS.map(section)).toEqual(['core', 'core', 'ui']);
  });

  it('searched by the full id: «cd» has to find core::dev', async () => {
    await npm.refresh();
    host.run('scripts.open');
    const items = popup()!['items'] as Array<{ key: string; text: string }>;
    expect(items.map((one) => one.text)).toEqual(SCRIPTS.map((one) => one.id));
  });

  it('choosing a row runs it and closes', async () => {
    await npm.refresh();
    host.run('scripts.open');
    (popup()!['onPick'] as (value: ScriptInfo) => void)(SCRIPTS[2]!);
    await tick();
    expect(host.ide(NAME).calls).toContainEqual({ method: 'run', params: { id: 'ui::dev' } });
    expect(popup()).toBeNull();
  });

  it('the launch plan is handed to a neighbour without running, and the second action is an entry in a key', async () => {
    host.ide(NAME).answers.set('run', () => ({ name: 'core::dev', command: 'pnpm run dev', argv: ['pnpm', 'run', 'dev'], cwd: 'packages/core' }));
    const plan = await npm.plan('core::dev');
    expect(plan.argv).toEqual(['pnpm', 'run', 'dev']);
    expect(host.ide('@mosetta/ide-plugin-terminal').calls.some((call) => call.method === 'open')).toBe(false);
    expect(host.registry.declared()).toContain('scripts.action');
    host.registry.add('scripts.action', { id: 'x' }, '@mosetta/ide-plugin-x');
    expect(host.complaints.some((one) => one.includes('scripts.action'))).toBe(true);
  });

  it('the state lives in instance fields rather than in module signals', () => {
    const second = new FakeHost();
    second.add(UiPlugin, '@mosetta/ide-plugin-ui');
    second.add(NpmScripts, NAME);
    host.run('scripts.open');
    expect(popup()).not.toBeNull();
    expect(second.ide(NAME).surfaces).toHaveLength(0);
  });

  /** What the popup would draw right now: `null` means closed. */
  function popup(): Record<string, unknown> | null {
    const drawn = host.ide(NAME).surfaces[0]!() as { props?: Record<string, unknown> } | null;
    return drawn ? (drawn.props ?? null) : null;
  }
});
