import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventName, EventPayload } from '@mosetta/ide-protocol';
import { ConfigStore } from '../src/config/store.js';
import { PluginProject } from '../src/plugins/project.js';
import { Env } from '../src/env/env.js';
import { Workspace } from '../src/workspace/workspace.js';
import { makeProject, removeProject, TEST_CONFIG_DIR } from './helpers.js';

/** The stand's `env/` axis: one process ledger per workspace and its projects. */
const env = new Env();

/** A tab: this is exactly what a workspace knows about a session. */
class FakeTab {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  readonly id = 'a tab';

  notify<E extends EventName>(event: E, payload: EventPayload<E>): void {
    this.heard.push({ event, payload });
  }
}

/** A plugin's resource: it remembers being disposed of. */
class Toy {
  disposed = false;
  dispose(): void {
    this.disposed = true;
  }
}

describe('the project as handed to a plugin', () => {
  let root = '';
  let ws: Workspace;
  let tab: FakeTab;

  beforeEach(async () => {
    root = await makeProject('plugin-project', { 'one.txt': 'one' });
    const config = await ConfigStore.load(TEST_CONFIG_DIR);
    ws = new Workspace(root, config, env.processes);
    tab = new FakeTab();
    ws.attach(tab);
  });

  afterEach(async () => {
    await ws.dispose();
    await removeProject(root);
  });

  it('the project\'s settings — with its layer over the machine\'s', async () => {
    await ws.dispose();
    await removeProject(root);
    root = await makeProject('plugin-project-settings', {
      'one.txt': 'one',
      '.mosetta/settings.json': '{ "lsp": { "checkProject": false, "memoryBudgetMb": 7 } }\n',
    });
    ws = new Workspace(root, await ConfigStore.load(TEST_CONFIG_DIR), env.processes);
    await ws.boot();
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    const defaults = { checkProject: true, memoryBudgetMb: 3000 };
    expect(project.settings('lsp', defaults)).toMatchObject({ checkProject: false, memoryBudgetMb: 7 });
    expect(project.settings('no-such-thing', { a: 1 }), 'no section — the defaults').toEqual({ a: 1 });
  });

  it('the preload waits for the project layer: the project\'s budget does not lose the race', async () => {
    await ws.dispose();
    await removeProject(root);
    const files: Record<string, string> = {
      '.mosetta/settings.json': '{ "fs": { "preloadBudgetMb": 0.000001 } }\n',
    };
    for (let i = 0; i < 30; i += 1) files[`src/f${i}.ts`] = `export const v${i} = ${i};\n`;
    root = await makeProject('plugin-project-preload', files);
    ws = new Workspace(root, await ConfigStore.load(TEST_CONFIG_DIR), env.processes);
    await ws.boot();
    await ws.services.preload();
    const resident = [...ws.services.ram.files()]
      .filter((file) => ws.services.ram.docSync(file.path) && file.path.startsWith('src/'))
      .map((file) => file.path);
    expect(resident).toEqual([]);
  });

  it('the root and the name are the project\'s own', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    expect(project.root).toBe(root);
    expect(project.name).toBe(ws.name);
  });

  it('a resource is created once', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    const first = project.use('a thing', () => new Toy());
    const second = project.use('a thing', () => new Toy());
    expect(second).toBe(first);
  });

  it('the keys are partitioned per plugin: the same name, different things', () => {
    const first = new PluginProject(ws, '@mosetta/ide-plugin-first', env.processes);
    const second = new PluginProject(ws, '@mosetta/ide-plugin-second', env.processes);
    expect(second.use('a thing', () => new Toy())).not.toBe(
      first.use('a thing', () => new Toy()),
    );
  });

  it('a resource is disposed of along with the project', async () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    const toy = project.use('a thing', () => new Toy());
    expect(toy.disposed).toBe(false);

    await ws.dispose();
    expect(toy.disposed).toBe(true);
  });

  it('an event reaches the tab in an envelope carrying the plugin\'s name', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    project.emit('data', { name: 'root::dev', data: 'hello' });

    expect(tab.heard).toEqual([
      {
        event: 'plugins.event',
        payload: {
          name: '@mosetta/ide-plugin-toy',
          event: 'data',
          payload: { name: 'root::dev', data: 'hello' },
        },
      },
    ]);
  });

  it('the event is heard by EVERY tab of this project', () => {
    const second = new FakeTab();
    ws.attach(second);
    new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes).emit('data', 'one');

    expect(tab.heard).toHaveLength(1);
    expect(second.heard).toHaveLength(1);
  });

  it('a hold keeps the project warm, and releasing it releases', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    ws.detach(tab);
    expect(ws.idle).toBe(true);

    const release = project.hold('a live terminal');
    expect(ws.idle).toBe(false);
    expect(ws.holdReasons).toEqual(['@mosetta/ide-plugin-toy: a live terminal']);

    release();
    expect(ws.idle).toBe(true);
  });

  it('a closed project lets nothing new be set up inside it', async () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-toy', env.processes);
    await ws.dispose();
    expect(() => project.use('a thing', () => new Toy())).toThrow();
  });
});
