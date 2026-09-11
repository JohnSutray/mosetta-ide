import { describe, expect, it } from 'vitest';
import type { WorkspaceInfo } from '@ide/protocol';
import { FakeHost } from '@ide/api/testing';
import ProjectsPlugin from '../src/client.js';
import UiPlugin from '@ide/ui';

function ws(id: string, root: string): WorkspaceInfo {
  return { id, root, name: root.slice(root.lastIndexOf('/') + 1), sessions: 1, held: [], openedAt: 0 };
}

const NAME = '@ide/plugin-projects';

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@ide/ui');
  const plugin = host.add(ProjectsPlugin, NAME);
  const ide = host.ide(NAME);
  ide.answers.set('roots', () => []);
  ide.answers.set('recent', () => []);
  ide.answers.set('browse', () => []);
  ide.answers.set('remember', () => null);
  await host.start();
  return { host, projects: plugin.projects };
}

describe('открывашка', () => {
  it('без проекта открыта сама, и Escape её не закрывает', async () => {
    const { host, projects } = await raise();
    expect(projects.visible.value).toBe(true);
    host.run('projects.close');
    expect(projects.visible.value).toBe(true);
  });

  it('проект появился откуда угодно — закрывается', async () => {
    const { host, projects } = await raise();
    host.surface.workspaceCurrent.value = ws('1', '/home/me/app');
    expect(projects.visible.value).toBe(false);
    host.run('projects.show');
    expect(projects.visible.value).toBe(true);
    host.run('projects.show');
    expect(projects.visible.value).toBe(false);
  });

  it('тык по папке подставляет путь и НЕ открывает проект', async () => {
    const { host, projects } = await raise();
    projects.pickDir({ path: '/home/me/code', name: 'code' });
    expect(projects.draft.value).toBe('/home/me/code');
    expect(projects.expanded.value.has('/home/me/code')).toBe(true);
    expect(host.surface.workspaceCalls.filter((c) => c.op === 'open')).toEqual([]);
  });

  it('Enter открывает набранное, а живой проект — переключает', async () => {
    const { host, projects } = await raise();
    projects.setDraft('/home/me/app');
    projects.accept();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.workspaceCalls.at(-1)).toEqual({ op: 'open', args: ['/home/me/app'] });

    projects.choose('/home/me/lib', 'live-7');
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.workspaceCalls.at(-1)).toEqual({ op: 'switchTo', args: ['live-7'] });
  });

  it('подсказки ходят по кругу через «ничего не выбрано»', async () => {
    const { host, projects } = await raise();
    host.ide(NAME).answers.set('browse', (params) =>
      (params as { prefix: string }).prefix === '/home/me/'
        ? [
            { path: '/home/me/a', name: 'a' },
            { path: '/home/me/b', name: 'b' },
          ]
        : [],
    );
    projects.setDraft('/home/me/');
    projects.openSuggest();
    await new Promise((r) => setTimeout(r, 0));
    expect(projects.suggestions.value).toHaveLength(2);
    host.run('projects.next');
    host.run('projects.next');
    expect(projects.selected.value).toBe(1);
    host.run('projects.next');
    expect(projects.selected.value).toBe(-1);
  });
});
