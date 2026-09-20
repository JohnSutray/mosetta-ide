import { describe, expect, it } from 'vitest';
import type { WorkspaceInfo } from '@mosetta/ide-protocol';
import { FakeHost } from '@mosetta/ide-api/testing';
import ProjectsPlugin from '../src/client.js';
import UiPlugin from '@mosetta/ide-plugin-ui';

/**
 * The picker as a plugin: what it promises.
 *
 * While there is no project it is open by itself and cannot be closed; once one appears
 * it closes, even if it was opened elsewhere. A click in the directory tree fills the
 * path in and does NOT open a project. A live project is switched to rather than opened
 * afresh.
 */
function ws(id: string, root: string): WorkspaceInfo {
  return { id, root, name: root.slice(root.lastIndexOf('/') + 1), sessions: 1, held: [], openedAt: 0 };
}

const NAME = '@mosetta/ide-plugin-projects';

async function raise() {
  const host = new FakeHost();
  host.add(UiPlugin, '@mosetta/ide-plugin-ui');
  const plugin = host.add(ProjectsPlugin, NAME);
  const ide = host.ide(NAME);
  ide.answers.set('roots', () => []);
  ide.answers.set('recent', () => []);
  ide.answers.set('browse', () => []);
  ide.answers.set('remember', () => null);
  await host.start();
  return { host, projects: plugin.projects };
}

describe('the project picker', () => {
  it('without a project it is open by itself, and Escape does not close it', async () => {
    const { host, projects } = await raise();
    expect(projects.visible.value).toBe(true);
    host.run('projects.close');
    expect(projects.visible.value).toBe(true);
  });

  it('a project appeared from anywhere — it closes', async () => {
    const { host, projects } = await raise();
    host.surface.workspaceCurrent.value = ws('1', '/home/me/app');
    expect(projects.visible.value).toBe(false);
    host.run('projects.show');
    expect(projects.visible.value).toBe(true);
    host.run('projects.show');
    expect(projects.visible.value).toBe(false);
  });

  it('poking a directory fills the path in and does NOT open the project', async () => {
    const { host, projects } = await raise();
    projects.pickDir({ path: '/home/me/code', name: 'code' });
    expect(projects.draft.value).toBe('/home/me/code');
    expect(projects.expanded.value.has('/home/me/code')).toBe(true);
    expect(host.surface.workspaceCalls.filter((c) => c.op === 'open')).toEqual([]);
  });

  it('Enter opens what was typed, and a live project is switched to', async () => {
    const { host, projects } = await raise();
    projects.setDraft('/home/me/app');
    projects.accept();
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.workspaceCalls.at(-1)).toEqual({ op: 'open', args: ['/home/me/app'] });

    projects.choose('/home/me/lib', 'live-7');
    await new Promise((r) => setTimeout(r, 0));
    expect(host.surface.workspaceCalls.at(-1)).toEqual({ op: 'switchTo', args: ['live-7'] });
  });

  it('the suggestions walk in a circle through «nothing selected»', async () => {
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
