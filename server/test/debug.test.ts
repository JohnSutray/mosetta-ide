import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, waitFor, withServer, type TestClient } from './helpers.js';

const DEBUG = '@mosetta/ide-plugin-debug';

interface PluginEvent {
  name: string;
  event: string;
  payload: unknown;
}

describe('отладчик (плагин)', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  const debug = (method: string, params: unknown = null) => c.call('plugins.call', { name: DEBUG, method, params });
  const events = (event: string) =>
    (c.events('plugins.event') as PluginEvent[]).filter((one) => one.name === DEBUG && one.event === event);

  beforeAll(async () => {
    root = await makeProject('debug', {
      'package.json': '{ "private": true, "type": "commonjs" }\n',
      'src/main.js': 'const words = ["раз", "два"];\nconst joined = words.join(" ");\nconsole.log(joined);\n',
    });
    server = await withServer();
    c = await connect(server);
    await c.call('workspace.open', { root });
  }, 60_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('точка срабатывает, стек называет файл проекта, программа доходит до конца', async () => {
    const placed = (await debug('setBreakpoints', { path: 'src/main.js', breakpoints: [{ line: 2 }] })) as {
      breakpoints: Array<{ line: number }>;
    };
    expect(placed.breakpoints.map((one) => one.line)).toEqual([2]);

    const run = (await debug('launch', { program: 'src/main.js' })) as { id: string };
    await waitFor(() => events('stopped').length > 0, 'stop on breakpoint', 20_000);
    const hit = events('stopped')[0]!.payload as { session: string; stop: { thread: number } };

    const frames = (await debug('stack', { run: run.id, session: hit.session, thread: hit.stop.thread })) as Array<{
      line: number;
      source: unknown;
    }>;
    expect(frames[0]).toMatchObject({ line: 2, source: { kind: 'project', path: 'src/main.js' } });

    await waitFor(() => events('terminal').length > 0, 'terminal named', 20_000);
    const name = (events('terminal')[0]!.payload as { name: string }).name;
    expect(name).toBe('debug::src/main.js');
    await debug('step', { run: run.id, session: hit.session, thread: hit.stop.thread, action: 'continue' });
    const printed = () =>
      (c.events('plugins.event') as PluginEvent[])
        .filter((one) => one.name === '@mosetta/ide-plugin-terminal' && one.event === 'data')
        .map((one) => (one.payload as { name: string; data: string }))
        .filter((one) => one.name === name)
        .map((one) => one.data)
        .join('');
    await waitFor(() => printed().includes('раз два'), 'program output in the terminal', 20_000);
    await waitFor(
      () => (events('runs').at(-1)?.payload as Array<{ state: string }> | undefined)?.[0]?.state === 'ended',
      'run end',
      20_000,
    );
  }, 60_000);
});
