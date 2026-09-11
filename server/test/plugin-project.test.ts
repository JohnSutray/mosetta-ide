import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventName, EventPayload } from '@ide/protocol';
import { ConfigStore } from '../src/config/store.js';
import { PluginProject } from '../src/plugins/project.js';
import { Env } from '../src/env/env.js';
import { Workspace } from '../src/workspace/workspace.js';
import { makeProject, removeProject, TEST_CONFIG_DIR } from './helpers.js';

const env = new Env();

class FakeTab {
  readonly heard: Array<{ event: string; payload: unknown }> = [];
  readonly id = 'вкладка';

  notify<E extends EventName>(event: E, payload: EventPayload<E>): void {
    this.heard.push({ event, payload });
  }
}

class Toy {
  disposed = false;
  dispose(): void {
    this.disposed = true;
  }
}

describe('проект, отданный плагину', () => {
  let root = '';
  let ws: Workspace;
  let tab: FakeTab;

  beforeEach(async () => {
    root = await makeProject('plugin-project', { 'один.txt': 'раз' });
    const config = await ConfigStore.load(TEST_CONFIG_DIR);
    ws = new Workspace(root, config, env.processes);
    tab = new FakeTab();
    ws.attach(tab);
  });

  afterEach(async () => {
    await ws.dispose();
    await removeProject(root);
  });

  it('корень и имя — те же, что у проекта', () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    expect(project.root).toBe(root);
    expect(project.name).toBe(ws.name);
  });

  it('ресурс создаётся один раз', () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    const first = project.use('вещь', () => new Toy());
    const second = project.use('вещь', () => new Toy());
    expect(second).toBe(first);
  });

  it('ключи разложены по плагинам: одинаковое имя — разные вещи', () => {
    const first = new PluginProject(ws, '@ide/plugin-первый', env.processes);
    const second = new PluginProject(ws, '@ide/plugin-второй', env.processes);
    expect(second.use('вещь', () => new Toy())).not.toBe(
      first.use('вещь', () => new Toy()),
    );
  });

  it('ресурс гасится вместе с проектом', async () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    const toy = project.use('вещь', () => new Toy());
    expect(toy.disposed).toBe(false);

    await ws.dispose();
    expect(toy.disposed).toBe(true);
  });

  it('событие доезжает до вкладки конвертом с именем плагина', () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    project.emit('data', { name: 'root::dev', data: 'привет' });

    expect(tab.heard).toEqual([
      {
        event: 'plugins.event',
        payload: {
          name: '@ide/plugin-игрушка',
          event: 'data',
          payload: { name: 'root::dev', data: 'привет' },
        },
      },
    ]);
  });

  it('событие слышат ВСЕ вкладки этого проекта', () => {
    const second = new FakeTab();
    ws.attach(second);
    new PluginProject(ws, '@ide/plugin-игрушка', env.processes).emit('data', 'раз');

    expect(tab.heard).toHaveLength(1);
    expect(second.heard).toHaveLength(1);
  });

  it('удержание держит проект тёплым, отпускание — отпускает', () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    ws.detach(tab);
    expect(ws.idle).toBe(true);

    const release = project.hold('живой терминал');
    expect(ws.idle).toBe(false);
    expect(ws.holdReasons).toEqual(['@ide/plugin-игрушка: живой терминал']);

    release();
    expect(ws.idle).toBe(true);
  });

  it('закрытый проект не даёт завести в себе новое', async () => {
    const project = new PluginProject(ws, '@ide/plugin-игрушка', env.processes);
    await ws.dispose();
    expect(() => project.use('вещь', () => new Toy())).toThrow();
  });
});
