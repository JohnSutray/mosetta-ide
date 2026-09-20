import { describe, expect, it } from 'vitest';
import { fuzzy } from '@mosetta/ide-plugin-ui';
import type { GitBranch, GitState } from '../src/types.js';
import { FakeHost } from '@mosetta/ide-api/testing';
import { BranchesWindow, Git, type GitRemote } from '../src/state.js';

new FakeHost();

function fakeIde() {
  const listeners = new Map<string, Array<(payload: unknown) => void>>();
  const complaints: string[] = [];
  return {
    complaints,
    on(event: string, handler: (payload: unknown) => void) {
      const list = listeners.get(event) ?? [];
      list.push(handler);
      listeners.set(event, list);
      return () => undefined;
    },
    working: () => () => undefined,
    t: (key: string) => key,
    mount: { bounds: () => ({ left: 0, top: 0, right: 1280, bottom: 720 }) },
    complain: (message: string) => complaints.push(message),
  };
}

const remote: GitRemote = {
  state: async () => ({ repo: false, branch: null, ahead: 0, behind: 0, files: {}, moved: {} }),
  branches: async () => [],
  outgoing: async () => ({ branch: null, upstream: null, local: [], remote: [], common: [] }) as never,
  changes: async () => [],
  run: async () => ({ error: null }),
};

function makeGit(ide = fakeIde()) {
  return new Git(remote, ide);
}

function state(files: GitState['files']): GitState {
  return { repo: true, branch: 'main', ahead: 0, behind: 0, files, moved: {} };
}

function branch(name: string, extra: Partial<GitBranch> = {}): GitBranch {
  return { name, current: false, remote: false, short: 'abc1234', ...extra } as GitBranch;
}

describe('git', () => {
  it('два экземпляра не делят ничего', () => {
    const one = makeGit();
    const two = makeGit();
    one.state.value = state({ 'a.ts': 'modified' });
    expect(two.state.value.files).toEqual({});
    expect(two.repo).toBe(false);
  });

  it('вся дорога до изменённого файла синяя', () => {
    const git = makeGit();
    git.state.value = state({ 'src/deep/a.ts': 'modified' });
    expect([...git.tint.value.entries()].sort()).toEqual([
      ['src', 'modified'],
      ['src/deep', 'modified'],
      ['src/deep/a.ts', 'modified'],
    ]);
  });

  it('новый и неверсионированный красятся одинаково', () => {
    const git = makeGit();
    git.state.value = state({ 'a.ts': 'added', 'b.ts': 'untracked', 'c.ts': 'conflict' });
    expect(git.tint.value.get('a.ts')).toBe('added');
    expect(git.tint.value.get('b.ts')).toBe('added');
    expect(git.tint.value.get('c.ts')).toBe('conflict');
  });

  it('удалённый файл не красится: в дереве его нет', () => {
    const git = makeGit();
    git.state.value = state({ 'a.ts': 'deleted' });
    expect(git.tint.value.size).toBe(0);
  });

  it('окно веток берёт список у git, а не держит свой', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main', { current: true }), branch('feature/x')];
    expect(window.shown.value.map((one) => one.name)).toEqual(['main', 'feature/x']);
  });

  it('стрелки ходят по отфильтрованному, а не по всему списку', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main'), branch('feature/x'), branch('feature/y')];
    window.setFilter('fy');
    expect(window.shown.value.map((one) => one.name)).toEqual(['feature/y']);
    expect(window.current.value?.name).toBe('feature/y');
    window.move(1);
    expect(window.current.value?.name).toBe('feature/y');
  });

  it('фильтр сбрасывает выделение на первую строку', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main'), branch('feature/x')];
    window.move(1);
    expect(window.selected.value).toBe(1);
    window.setFilter('m');
    expect(window.selected.value).toBe(0);
  });

  it('заголовки разделов невыбираемы и стоят перед своими ветками', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main'), branch('origin/main', { remote: true })];
    expect(window.rows.value.map((row) => row.kind)).toEqual([
      'head',
      'branch',
      'head',
      'remote',
      'branch',
    ]);
    const last = window.rows.value.at(-1)!;
    expect(last.kind === 'branch' && last.label).toBe('main');
  });

  it('Escape закрывает по одному слою', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main', { current: true })];
    git.state.value = state({});
    window.show();
    window.prompt.value = { action: 'rename', value: 'main' };
    window.menu.value = { name: 'main', x: 0, y: 0 };

    window.close();
    expect(window.menu.value).toBeNull();
    expect(window.open.value).toBe(true);

    window.close();
    expect(window.prompt.value).toBeNull();
    expect(window.open.value).toBe(true);

    window.close();
    expect(window.open.value).toBe(false);
  });

  it('без репозитория окно веток не открывается и говорит об этом', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    window.show();
    expect(window.open.value).toBe(false);
    expect(ide.complaints).toHaveLength(1);
  });
});
