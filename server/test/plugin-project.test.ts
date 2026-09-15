import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { EventName, EventPayload } from '@mosetta/ide-protocol';
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

  it('настройки проекта — с его слоем поверх машинного (ADR-0214, правка 16.09)', async () => {
    await ws.dispose();
    await removeProject(root);
    root = await makeProject('plugin-project-settings', {
      'один.txt': 'раз',
      '.mosetta/settings.json': '{ "lsp": { "checkProject": false, "memoryBudgetMb": 7 } }\n',
    });
    ws = new Workspace(root, await ConfigStore.load(TEST_CONFIG_DIR), env.processes);
    await ws.boot();
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    const defaults = { checkProject: true, memoryBudgetMb: 3000 };
    expect(project.settings('lsp', defaults)).toMatchObject({ checkProject: false, memoryBudgetMb: 7 });
    expect(project.settings('нет-такого', { a: 1 }), 'нет раздела — умолчания').toEqual({ a: 1 });
  });

  it('предзагрузка ждёт проектный слой: бюджет проекта не проигрывает гонку', async () => {
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

  it('корень и имя — те же, что у проекта', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    expect(project.root).toBe(root);
    expect(project.name).toBe(ws.name);
  });

  it('ресурс создаётся один раз', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    const first = project.use('вещь', () => new Toy());
    const second = project.use('вещь', () => new Toy());
    expect(second).toBe(first);
  });

  it('ключи разложены по плагинам: одинаковое имя — разные вещи', () => {
    const first = new PluginProject(ws, '@mosetta/ide-plugin-первый', env.processes);
    const second = new PluginProject(ws, '@mosetta/ide-plugin-второй', env.processes);
    expect(second.use('вещь', () => new Toy())).not.toBe(
      first.use('вещь', () => new Toy()),
    );
  });

  it('ресурс гасится вместе с проектом', async () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    const toy = project.use('вещь', () => new Toy());
    expect(toy.disposed).toBe(false);

    await ws.dispose();
    expect(toy.disposed).toBe(true);
  });

  it('событие доезжает до вкладки конвертом с именем плагина', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    project.emit('data', { name: 'root::dev', data: 'привет' });

    expect(tab.heard).toEqual([
      {
        event: 'plugins.event',
        payload: {
          name: '@mosetta/ide-plugin-игрушка',
          event: 'data',
          payload: { name: 'root::dev', data: 'привет' },
        },
      },
    ]);
  });

  it('событие слышат ВСЕ вкладки этого проекта', () => {
    const second = new FakeTab();
    ws.attach(second);
    new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes).emit('data', 'раз');

    expect(tab.heard).toHaveLength(1);
    expect(second.heard).toHaveLength(1);
  });

  it('удержание держит проект тёплым, отпускание — отпускает', () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    ws.detach(tab);
    expect(ws.idle).toBe(true);

    const release = project.hold('живой терминал');
    expect(ws.idle).toBe(false);
    expect(ws.holdReasons).toEqual(['@mosetta/ide-plugin-игрушка: живой терминал']);

    release();
    expect(ws.idle).toBe(true);
  });

  it('закрытый проект не даёт завести в себе новое', async () => {
    const project = new PluginProject(ws, '@mosetta/ide-plugin-игрушка', env.processes);
    await ws.dispose();
    expect(() => project.use('вещь', () => new Toy())).toThrow();
  });
});
