import { describe, expect, it } from 'vitest';
import type { GitBranch, GitState } from '@ide/protocol';
import { BranchesWindow, Git } from '../src/state/git.js';

function state(files: GitState['files']): GitState {
  return { repo: true, branch: 'main', ahead: 0, behind: 0, files };
}

function branch(name: string, extra: Partial<GitBranch> = {}): GitBranch {
  return { name, current: false, remote: false, short: 'abc1234', ...extra } as GitBranch;
}

describe('git', () => {
  it('два экземпляра не делят ничего', () => {
    const one = new Git();
    const two = new Git();
    one.state.value = state({ 'a.ts': 'modified' });
    expect(two.state.value.files).toEqual({});
    expect(two.repo).toBe(false);
  });

  it('вся дорога до изменённого файла синяя', () => {
    const git = new Git();
    git.state.value = state({ 'src/deep/a.ts': 'modified' });
    expect([...git.tint.value.entries()].sort()).toEqual([
      ['src', 'modified'],
      ['src/deep', 'modified'],
      ['src/deep/a.ts', 'modified'],
    ]);
  });

  it('новый и неверсионированный красятся одинаково', () => {
    const git = new Git();
    git.state.value = state({ 'a.ts': 'added', 'b.ts': 'untracked', 'c.ts': 'conflict' });
    expect(git.tint.value.get('a.ts')).toBe('added');
    expect(git.tint.value.get('b.ts')).toBe('added');
    expect(git.tint.value.get('c.ts')).toBe('conflict');
  });

  it('удалённый файл не красится: в дереве его нет', () => {
    const git = new Git();
    git.state.value = state({ 'a.ts': 'deleted' });
    expect(git.tint.value.size).toBe(0);
  });

  it('окно веток берёт список у git, а не держит свой', () => {
    const git = new Git();
    const window = new BranchesWindow(git);
    git.branches.value = [branch('main', { current: true }), branch('feature/x')];
    expect(window.shown.value.map((one) => one.name)).toEqual(['main', 'feature/x']);
  });

  it('стрелки ходят по отфильтрованному, а не по всему списку', () => {
    const git = new Git();
    const window = new BranchesWindow(git);
    git.branches.value = [branch('main'), branch('feature/x'), branch('feature/y')];
    window.setFilter('fy');
    expect(window.shown.value.map((one) => one.name)).toEqual(['feature/y']);
    expect(window.current.value?.name).toBe('feature/y');
    window.move(1);
    expect(window.current.value?.name).toBe('feature/y');
  });

  it('фильтр сбрасывает выделение на первую строку', () => {
    const git = new Git();
    const window = new BranchesWindow(git);
    git.branches.value = [branch('main'), branch('feature/x')];
    window.move(1);
    expect(window.selected.value).toBe(1);
    window.setFilter('m');
    expect(window.selected.value).toBe(0);
  });

  it('заголовки разделов невыбираемы и стоят перед своими ветками', () => {
    const git = new Git();
    const window = new BranchesWindow(git);
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
    const git = new Git();
    const window = new BranchesWindow(git);
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
    const git = new Git();
    const window = new BranchesWindow(git);
    window.show();
    expect(window.open.value).toBe(false);
  });
});
