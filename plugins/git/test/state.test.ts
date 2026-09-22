import { describe, expect, it } from 'vitest';
import { fuzzy } from '@mosetta/ide-plugin-ui';
import type { GitBranch, GitState } from '../src/types.js';
import { FakeHost } from '@mosetta/ide-api/testing';
import { BranchesWindow, Git, type GitRemote } from '../src/state.js';

new FakeHost();

/**
 * The services the state classes receive through the constructor: the server and the
 * IDE are substituted, and there is no socket. `new Git()` used to silently pull in a
 * module-level wire; now what the test did not give does not exist.
 */
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

/** `new Git()` from the old test — now with its services. */
function makeGit(ide = fakeIde()) {
  return new Git(remote, ide);
}

/**
 * git on the client — and at the same time the proof of what it was rewritten as
 * classes for.
 *
 * There used to be thirty-four module-level exports here, and writing this file was
 * impossible: the state lived in the module, a test received it from the previous test,
 * and "set up a git of its own" meant reloading the module. Now it is `new Git(remote,
 * ide)` — and it knows what it was given, and nothing else.
 */

function state(files: GitState['files']): GitState {
  return { repo: true, branch: 'main', ahead: 0, behind: 0, files, moved: {} };
}

function branch(name: string, extra: Partial<GitBranch> = {}): GitBranch {
  return { name, current: false, remote: false, short: 'abc1234', ...extra } as GitBranch;
}

describe('git', () => {
  it('two instances share nothing', () => {
    const one = makeGit();
    const two = makeGit();
    one.state.value = state({ 'a.ts': 'modified' });
    expect(two.state.value.files).toEqual({});
    expect(two.repo).toBe(false);
  });

  it('the whole road to a changed file is blue', () => {
    const git = makeGit();
    git.state.value = state({ 'src/deep/a.ts': 'modified' });
    expect([...git.tint.value.entries()].sort()).toEqual([
      ['src', 'modified'],
      ['src/deep', 'modified'],
      ['src/deep/a.ts', 'modified'],
    ]);
  });

  it('new and unversioned are painted alike', () => {
    const git = makeGit();
    git.state.value = state({ 'a.ts': 'added', 'b.ts': 'untracked', 'c.ts': 'conflict' });
    expect(git.tint.value.get('a.ts')).toBe('added');
    expect(git.tint.value.get('b.ts')).toBe('added');
    expect(git.tint.value.get('c.ts')).toBe('conflict');
  });

  it('a deleted file is not painted: it is not in the tree', () => {
    const git = makeGit();
    git.state.value = state({ 'a.ts': 'deleted' });
    expect(git.tint.value.size).toBe(0);
  });

  it('the branches window takes the list from git rather than keeping its own', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main', { current: true }), branch('feature/x')];
    expect(window.shown.value.map((one) => one.name)).toEqual(['main', 'feature/x']);
  });

  it('the arrows walk the filtered list rather than the whole one', () => {
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

  it('the filter resets the selection to the first row', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    git.branches.value = [branch('main'), branch('feature/x')];
    window.move(1);
    expect(window.selected.value).toBe(1);
    window.setFilter('m');
    expect(window.selected.value).toBe(0);
  });

  it('the section headings are unselectable and stand before their branches', () => {
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

  it('Escape closes one layer at a time', () => {
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

  it('without a repository the branches window does not open, and it says so', () => {
    const ide = fakeIde();
    const git = new Git(remote, ide);
    const window = new BranchesWindow(git, ide, () => fuzzy);
    window.show();
    expect(window.open.value).toBe(false);
    expect(ide.complaints).toHaveLength(1);
  });
});
