import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import type { GitState } from '@mosetta/ide-plugin-git';
import { DEFAULT_LIST, UNRESOLVED_LIST, Changes, type ChangesRemote } from '../src/state.js';
import type { Changelist } from '../src/changelist.js';
import type { ShelfItem } from '../src/shelf.js';

/** A promise the test has no need to await for real: the server is a fake. */
function await0(p: Promise<unknown>): void {
  void p;
}

function snapshot(files: GitState['files']) {
  return signal<GitState>({ repo: true, branch: 'main', ahead: 0, behind: 0, files, moved: {} });
}

function raise(files: GitState['files'], answers: Partial<ChangesRemote> = {}) {
  const asked: Array<{ what: string; ask: unknown }> = [];
  const said: string[] = [];
  const remote: ChangesRemote = {
    commit: async (ask) => {
      asked.push({ what: 'commit', ask });
      return { error: null };
    },
    shelve: async (ask) => {
      asked.push({ what: 'shelve', ask });
      return { error: null };
    },
    shelves: async () => [] as ShelfItem[],
    unshelve: async () => ({ error: null }),
    drop: async () => ({ error: null }),
    patch: async () => ({ text: '' }),
    write: async () => ({ error: null }),
    patchBase: async () => ({ text: '' }),
    lists: async () => [] as Changelist[],
    listCreate: async ({ name }) => {
      asked.push({ what: 'listCreate', ask: { name } });
      return { id: name, name, files: [] };
    },
    listRename: async (ask) => {
      asked.push({ what: 'listRename', ask });
      return { error: null };
    },
    listRemove: async (ask) => {
      asked.push({ what: 'listRemove', ask });
      return { error: null };
    },
    listMove: async (ask) => {
      asked.push({ what: 'listMove', ask });
      return { error: null };
    },
    revert: async (ask) => {
      asked.push({ what: 'revert', ask });
      return { error: null };
    },
    shelfRename: async (ask) => {
      asked.push({ what: 'shelfRename', ask });
      return { error: null };
    },
    lastMessage: async () => ({ text: 'the previous commit\'s message' }),
    identity: async () => ({ name: 'Someone', email: 'someone@somewhere', fromGit: { name: 'Someone', email: 'someone@somewhere' } }),
    identityWrite: async (ask) => {
      asked.push({ what: 'identityWrite', ask });
      return { error: null };
    },
    draftRead: async () => ({ text: '' }),
    draftWrite: async (ask) => {
      asked.push({ what: 'draftWrite', ask });
      return { error: null };
    },
    ...answers,
  };
  const git = snapshot(files);
  const rescans: number[] = [];
  const changes = new Changes(
    remote,
    () => git,
    (text) => said.push(text),
    signal(''),
    signal<string[]>([]),
    signal<string[]>([]),
    async () => {
      rescans.push(1);
    },
  );
  changes.authorName.value = 'Someone';
  changes.authorEmail.value = 'someone@somewhere';
  return { changes, asked, said, git, rescans };
}

describe('the changes panel', () => {
  it('the list is taken from git and sorted by path', () => {
    const { changes } = raise({ 'src/b.ts': 'modified', 'src/a.ts': 'untracked' });
    expect(changes.rows.value.map((row) => `${row.path}:${row.state}`)).toEqual([
      'src/a.ts:untracked',
      'src/b.ts:modified',
    ]);
  });

  it('a new file is ticked by itself: we remember the UNTICKED rather than the ticked', () => {
    const { changes, git } = raise({ 'src/a.ts': 'modified' });
    changes.toggleFile('src/a.ts');
    expect(changes.picked.value).toEqual([]);

    git.value = { ...git.value, files: { 'src/a.ts': 'modified', 'src/b.ts': 'untracked' } };
    expect(changes.picked.value).toEqual(['src/b.ts']);
  });

  it('it commits what is ticked and wipes the message only after a success', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified', 'src/b.ts': 'modified' });
    changes.message.value = 'an edit';
    changes.toggleFile('src/b.ts');

    await changes.commit();
    expect(asked[0]).toMatchObject({ what: 'commit', ask: { message: 'an edit', files: ['src/a.ts'], amend: false } });
    expect(changes.message.value).toBe('');
  });

  it('a failed commit does not carry off the message, and speaks up', async () => {
    const { changes, said } = raise(
      { 'src/a.ts': 'modified' },
      { commit: async () => ({ error: 'nothing to commit' }) },
    );
    changes.message.value = 'half a minute of writing';

    await changes.commit();
    expect(changes.message.value, 'the text is in place').toBe('half a minute of writing');
    expect(changes.error.value).toBe('nothing to commit');
    expect(said).toEqual(['nothing to commit']);
  });

  it('the button does not lie: with no message and no files there is no commit', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    expect(changes.canCommit.value, 'an empty message').toBe(false);
    changes.message.value = 'present';
    expect(changes.canCommit.value).toBe(true);
    changes.toggleAll();
    expect(changes.canCommit.value, 'every tick taken off').toBe(false);
    await changes.commit();
    expect(asked, 'the press did nothing').toEqual([]);
  });

  it('after a commit the snapshot is recomputed: the files were not touched, the memory says nothing', async () => {
    const { changes, rescans } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'an edit';
    await changes.commit();
    expect(rescans).toHaveLength(1);
  });

  it('what is ticked goes to the shelf, and the name is taken from the message', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    await changes.shelve('will finish later');
    expect(asked).toEqual([{ what: 'shelve', ask: { name: 'will finish later', files: ['src/a.ts'] } }]);
    expect(changes.message.value, 'it went away with the patch').toBe('');
  });

  it('the shelf is read by PROJECT rather than by the opening of the panel', async () => {
    const item: ShelfItem = { id: '1', name: 'later', at: '2026-09-17T08:00:00.000Z', files: ['src/a.ts'] };
    const { changes } = raise({}, { shelves: async () => [item] });
    const tab = signal<{ root: string } | null>(null);
    const attached = signal<unknown>(null);
    const live = signal(true);

    changes.follow(tab, attached, live);
    expect(changes.shelf.value, 'there is nobody to ask — the session is not attached').toEqual([]);

    attached.value = { id: 'w1' };
    await Promise.resolve();
    expect(changes.shelf.value).toEqual([item]);

    tab.value = { root: '/two' };
    expect(changes.shelf.value).toEqual([]);
  });

  it('the same project with a new id does NOT wipe the memory', async () => {
    const item: ShelfItem = { id: '1', name: 'later', at: '2026-09-18T08:00:00.000Z', files: ['src/a.ts'] };
    const { changes } = raise({}, { shelves: async () => [item] });
    const tab = signal<{ root: string } | null>({ root: '/one' });
    const attached = signal<unknown>({ id: 'w1' });
    const live = signal(true);

    changes.follow(tab, attached, live);
    await Promise.resolve();
    expect(changes.shelf.value).toEqual([item]);

    tab.value = { root: '/one' };
    expect(changes.shelf.value, 'the shelf is in place').toEqual([item]);
  });

  it('the connection broke and came back — we read again', async () => {
    const item: ShelfItem = { id: '1', name: 'later', at: '2026-09-18T08:00:00.000Z', files: ['src/a.ts'] };
    let answers = 0;
    const { changes } = raise(
      {},
      {
        shelves: async () => {
          answers += 1;
          return [item];
        },
      },
    );
    const tab = signal<{ root: string } | null>(null);
    const attached = signal<unknown>({ id: 'w1' });
    const live = signal(true);

    changes.follow(tab, attached, live);
    await Promise.resolve();
    expect(answers).toBe(1);

    live.value = false;
    live.value = true;
    await Promise.resolve();
    expect(answers, 'the connection came back — we asked again').toBe(2);
  });

  it('the conflicts are always in `unresolved`, whatever is moved into them', () => {
    const { changes } = raise({ 'src/a.ts': 'conflict', 'src/b.ts': 'modified' });
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
      { id: 'mine', name: 'mine', files: ['src/a.ts', 'src/b.ts'] },
    ];

    const where = (path: string) =>
      changes.groups.value.find((group) => group.rows.some((row) => row.path === path))?.list.id;
    expect(where('src/a.ts')).toBe(UNRESOLVED_LIST);
    expect(where('src/b.ts')).toBe('mine');
  });

  it('an empty `unresolved` is not shown, an empty `changes` is', () => {
    const { changes } = raise({ 'src/b.ts': 'modified' });
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
    ];
    expect(changes.groups.value.map((group) => group.list.id)).toEqual([DEFAULT_LIST]);
  });

  it('a list of one\'s own does not vanish on emptying, while an empty `unresolved` is not shown', () => {
    const { changes } = raise({});
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
      { id: 'mine', name: 'mine', files: ['src/a.ts'] },
    ];
    expect(changes.groups.value.map((group) => group.list.id)).toEqual([DEFAULT_LIST, 'mine']);
  });

  it('a file\'s move arrives in the row: the diff needs the old name', () => {
    const git = snapshot({ 'new.ts': 'modified' });
    git.value = { ...git.value, moved: { 'new.ts': 'old.ts' } };
    const changes = new Changes(
      {
        commit: async () => ({ error: null }),
        shelve: async () => ({ error: null }),
        shelves: async () => [],
        unshelve: async () => ({ error: null }),
        drop: async () => ({ error: null }),
        patch: async () => ({ text: '' }),
        write: async () => ({ error: null }),
        patchBase: async () => ({ text: '' }),
        lists: async () => [],
        listCreate: async () => ({ id: 'x', name: 'x', files: [] }),
        listRename: async () => ({ error: null }),
        listRemove: async () => ({ error: null }),
        listMove: async () => ({ error: null }),
        revert: async () => ({ error: null }),
        shelfRename: async () => ({ error: null }),
        lastMessage: async () => ({ text: '' }),
        draftRead: async () => ({ text: '' }),
        draftWrite: async () => ({ error: null }),
        identity: async () => ({ name: '', email: '', fromGit: { name: '', email: '' } }),
        identityWrite: async () => ({ error: null }),
      },
      () => git,
      () => undefined,
      signal(''),
      signal<string[]>([]),
      signal<string[]>([]),
      async () => undefined,
    );
    expect(changes.rows.value[0]).toMatchObject({ path: 'new.ts', from: 'old.ts' });
  });

  it('Shift takes a range, Ctrl adds one at a time', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified', 'c.ts': 'modified', 'd.ts': 'modified' });
    changes.pick('a.ts');
    changes.pick('c.ts', { shift: true });
    expect(changes.selected.value).toEqual(['a.ts', 'b.ts', 'c.ts']);

    changes.pick('d.ts', { ctrl: true });
    expect(changes.selected.value).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);

    changes.pick('b.ts', { ctrl: true });
    expect(changes.selected.value, 'a repeated Ctrl takes it off').toEqual(['a.ts', 'c.ts', 'd.ts']);

    changes.pick('b.ts');
    expect(changes.selected.value, 'with no modifiers — this one only').toEqual(['b.ts']);
  });

  it('a folded list gives its rows neither to the arrows nor to the search', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    expect(changes.visibleOrder()).toEqual(['a.ts', 'b.ts']);
    changes.toggleFold(DEFAULT_LIST);
    expect(changes.visibleOrder()).toEqual([]);
  });

  it('a list\'s tick box shows the state of the contents rather than its own', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    expect(changes.groups.value[0]!.checked).toBe('all');

    changes.toggleFile('a.ts');
    expect(changes.groups.value[0]!.checked).toBe('some');

    changes.toggleGroup(DEFAULT_LIST);
    expect(changes.groups.value[0]!.checked, 'half the list is ticked — a click ticks it all').toBe('all');

    changes.toggleGroup(DEFAULT_LIST);
    expect(changes.groups.value[0]!.checked).toBe('none');
  });

  it('an action takes what is SELECTED, and with no selection the row under the caret', () => {
    const { changes, asked } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    changes.pick('a.ts');
    changes.pick('b.ts', { ctrl: true });
    await0(changes.revert(changes.targets()));
    expect(asked.at(-1)).toEqual({ what: 'revert', ask: { files: ['a.ts', 'b.ts'] } });
  });

  it('with no signature a commit is impossible: git would refuse by itself', () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'an edit';
    expect(changes.canCommit.value).toBe(true);

    changes.authorEmail.value = '';
    expect(changes.signed.value).toBe(false);
    expect(changes.canCommit.value).toBe(false);
  });

  it('the signature travels with the commit explicitly: the user saw it before the press', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'an edit';
    changes.authorName.value = 'Ivan';
    changes.authorEmail.value = 'ivan@example.com';
    await changes.commit();
    expect(asked[0]).toEqual({
      what: 'commit',
      ask: { message: 'an edit', files: ['src/a.ts'], amend: false, name: 'Ivan', email: 'ivan@example.com' },
    });
  });

  it('an amend puts in the message of the commit being edited, and takes it back again', async () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'what was started';

    await changes.toggleAmend();
    expect(changes.message.value, 'in the field is the message of the commit we are editing').toBe(
      'the previous commit\'s message',
    );

    await changes.toggleAmend();
    expect(changes.message.value, 'what was put in was left untouched — one\'s own came back').toBe('what was started');
  });

  it('an amend does NOT take away what the user wrote over what was put in', async () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'what was started';
    await changes.toggleAmend();
    changes.message.value = 'the previous commit\'s message, extended';

    await changes.toggleAmend();
    expect(changes.message.value).toBe('the previous commit\'s message, extended');
  });

  it('the "all" tick box switches both ways', () => {
    const { changes } = raise({ 'src/a.ts': 'modified', 'src/b.ts': 'modified' });
    changes.toggleAll();
    expect(changes.picked.value).toEqual([]);
    changes.toggleAll();
    expect(changes.picked.value).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
