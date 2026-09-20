import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import type { GitState } from '@mosetta/ide-plugin-git';
import { DEFAULT_LIST, UNRESOLVED_LIST, Changes, type ChangesRemote } from '../src/state.js';
import type { Changelist } from '../src/changelist.js';
import type { ShelfItem } from '../src/shelf.js';

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
    lastMessage: async () => ({ text: 'сообщение прошлого коммита' }),
    identity: async () => ({ name: 'Кто-то', email: 'кто@то', fromGit: { name: 'Кто-то', email: 'кто@то' } }),
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
  changes.authorName.value = 'Кто-то';
  changes.authorEmail.value = 'кто@то';
  return { changes, asked, said, git, rescans };
}

describe('панель изменений', () => {
  it('список берётся у git и отсортирован по пути', () => {
    const { changes } = raise({ 'src/b.ts': 'modified', 'src/a.ts': 'untracked' });
    expect(changes.rows.value.map((row) => `${row.path}:${row.state}`)).toEqual([
      'src/a.ts:untracked',
      'src/b.ts:modified',
    ]);
  });

  it('новый файл отмечен сам: помним СНЯТЫЕ, а не отмеченные', () => {
    const { changes, git } = raise({ 'src/a.ts': 'modified' });
    changes.toggleFile('src/a.ts');
    expect(changes.picked.value).toEqual([]);

    git.value = { ...git.value, files: { 'src/a.ts': 'modified', 'src/b.ts': 'untracked' } };
    expect(changes.picked.value).toEqual(['src/b.ts']);
  });

  it('коммитит отмеченное и стирает сообщение только после удачи', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified', 'src/b.ts': 'modified' });
    changes.message.value = 'правка';
    changes.toggleFile('src/b.ts');

    await changes.commit();
    expect(asked[0]).toMatchObject({ what: 'commit', ask: { message: 'правка', files: ['src/a.ts'], amend: false } });
    expect(changes.message.value).toBe('');
  });

  it('неудачный коммит не уносит сообщение и говорит вслух', async () => {
    const { changes, said } = raise(
      { 'src/a.ts': 'modified' },
      { commit: async () => ({ error: 'nothing to commit' }) },
    );
    changes.message.value = 'полминуты писал';

    await changes.commit();
    expect(changes.message.value, 'текст на месте').toBe('полминуты писал');
    expect(changes.error.value).toBe('nothing to commit');
    expect(said).toEqual(['nothing to commit']);
  });

  it('кнопка не врёт: без сообщения и без файлов коммита нет', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    expect(changes.canCommit.value, 'пустое сообщение').toBe(false);
    changes.message.value = 'есть';
    expect(changes.canCommit.value).toBe(true);
    changes.toggleAll();
    expect(changes.canCommit.value, 'сняли все галки').toBe(false);
    await changes.commit();
    expect(asked, 'нажатие ничего не сделало').toEqual([]);
  });

  it('после коммита снимок пересчитывают: файлы не трогали, память молчит', async () => {
    const { changes, rescans } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'правка';
    await changes.commit();
    expect(rescans).toHaveLength(1);
  });

  it('на полку уходит отмеченное, а имя берётся из сообщения', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    await changes.shelve('потом доделаю');
    expect(asked).toEqual([{ what: 'shelve', ask: { name: 'потом доделаю', files: ['src/a.ts'] } }]);
    expect(changes.message.value, 'ушло вместе с патчем').toBe('');
  });

  it('полка читается по ПРОЕКТУ, а не по открытию панели', async () => {
    const item: ShelfItem = { id: '1', name: 'потом', at: '2026-09-17T08:00:00.000Z', files: ['src/a.ts'] };
    const { changes } = raise({}, { shelves: async () => [item] });
    const tab = signal<{ root: string } | null>(null);
    const attached = signal<unknown>(null);
    const live = signal(true);

    changes.follow(tab, attached, live);
    expect(changes.shelf.value, 'спрашивать некого — сессия не прикреплена').toEqual([]);

    attached.value = { id: 'w1' };
    await Promise.resolve();
    expect(changes.shelf.value).toEqual([item]);

    tab.value = { root: '/два' };
    expect(changes.shelf.value).toEqual([]);
  });

  it('тот же проект с новым id память НЕ чистит (правка 18.09)', async () => {
    const item: ShelfItem = { id: '1', name: 'потом', at: '2026-09-18T08:00:00.000Z', files: ['src/a.ts'] };
    const { changes } = raise({}, { shelves: async () => [item] });
    const tab = signal<{ root: string } | null>({ root: '/один' });
    const attached = signal<unknown>({ id: 'w1' });
    const live = signal(true);

    changes.follow(tab, attached, live);
    await Promise.resolve();
    expect(changes.shelf.value).toEqual([item]);

    tab.value = { root: '/один' };
    expect(changes.shelf.value, 'полка на месте').toEqual([item]);
  });

  it('оборвалась связь и вернулась — читаем заново (правка 18.09)', async () => {
    const item: ShelfItem = { id: '1', name: 'потом', at: '2026-09-18T08:00:00.000Z', files: ['src/a.ts'] };
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
    expect(answers, 'связь вернулась — спросили заново').toBe(2);
  });

  it('конфликты всегда в `unresolved`, что бы в них ни перекладывали', () => {
    const { changes } = raise({ 'src/a.ts': 'conflict', 'src/b.ts': 'modified' });
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
      { id: 'mine', name: 'моё', files: ['src/a.ts', 'src/b.ts'] },
    ];

    const where = (path: string) =>
      changes.groups.value.find((group) => group.rows.some((row) => row.path === path))?.list.id;
    expect(where('src/a.ts')).toBe(UNRESOLVED_LIST);
    expect(where('src/b.ts')).toBe('mine');
  });

  it('пустой `unresolved` не показывается, пустой `changes` — показывается', () => {
    const { changes } = raise({ 'src/b.ts': 'modified' });
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
    ];
    expect(changes.groups.value.map((group) => group.list.id)).toEqual([DEFAULT_LIST]);
  });

  it('свой список не пропадает, опустев, а пустой `unresolved` не показывается', () => {
    const { changes } = raise({});
    changes.lists.value = [
      { id: DEFAULT_LIST, name: DEFAULT_LIST, files: [] },
      { id: UNRESOLVED_LIST, name: UNRESOLVED_LIST, files: [] },
      { id: 'mine', name: 'моё', files: ['src/a.ts'] },
    ];
    expect(changes.groups.value.map((group) => group.list.id)).toEqual([DEFAULT_LIST, 'mine']);
  });

  it('переезд файла приезжает в строку: диффу нужно старое имя', () => {
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

  it('Shift берёт диапазон, Ctrl добавляет по одной', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified', 'c.ts': 'modified', 'd.ts': 'modified' });
    changes.pick('a.ts');
    changes.pick('c.ts', { shift: true });
    expect(changes.selected.value).toEqual(['a.ts', 'b.ts', 'c.ts']);

    changes.pick('d.ts', { ctrl: true });
    expect(changes.selected.value).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);

    changes.pick('b.ts', { ctrl: true });
    expect(changes.selected.value, 'повторный Ctrl снимает').toEqual(['a.ts', 'c.ts', 'd.ts']);

    changes.pick('b.ts');
    expect(changes.selected.value, 'без модификаторов — только эта').toEqual(['b.ts']);
  });

  it('свёрнутый список не отдаёт свои строки ни стрелкам, ни поиску', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    expect(changes.visibleOrder()).toEqual(['a.ts', 'b.ts']);
    changes.toggleFold(DEFAULT_LIST);
    expect(changes.visibleOrder()).toEqual([]);
  });

  it('галка списка показывает состояние содержимого, а не своё', () => {
    const { changes } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    expect(changes.groups.value[0]!.checked).toBe('all');

    changes.toggleFile('a.ts');
    expect(changes.groups.value[0]!.checked).toBe('some');

    changes.toggleGroup(DEFAULT_LIST);
    expect(changes.groups.value[0]!.checked, 'полсписка отмечено — щелчок отмечает всё').toBe('all');

    changes.toggleGroup(DEFAULT_LIST);
    expect(changes.groups.value[0]!.checked).toBe('none');
  });

  it('действие берёт ВЫДЕЛЕННОЕ, а без выделения — строку под кареткой', () => {
    const { changes, asked } = raise({ 'a.ts': 'modified', 'b.ts': 'modified' });
    changes.pick('a.ts');
    changes.pick('b.ts', { ctrl: true });
    await0(changes.revert(changes.targets()));
    expect(asked.at(-1)).toEqual({ what: 'revert', ask: { files: ['a.ts', 'b.ts'] } });
  });

  it('без подписи коммит невозможен: git отказал бы и сам', () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'правка';
    expect(changes.canCommit.value).toBe(true);

    changes.authorEmail.value = '';
    expect(changes.signed.value).toBe(false);
    expect(changes.canCommit.value).toBe(false);
  });

  it('подпись уходит с коммитом явно: человек видел её перед нажатием', async () => {
    const { changes, asked } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'правка';
    changes.authorName.value = 'Иван';
    changes.authorEmail.value = 'ivan@example.com';
    await changes.commit();
    expect(asked[0]).toEqual({
      what: 'commit',
      ask: { message: 'правка', files: ['src/a.ts'], amend: false, name: 'Иван', email: 'ivan@example.com' },
    });
  });

  it('аменд подставляет сообщение правимого коммита и убирает его назад', async () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'начатое';

    await changes.toggleAmend();
    expect(changes.message.value, 'в поле — сообщение того коммита, который правим').toBe(
      'сообщение прошлого коммита',
    );

    await changes.toggleAmend();
    expect(changes.message.value, 'подставленное не тронули — вернулось своё').toBe('начатое');
  });

  it('аменд НЕ отнимает то, что человек написал поверх подставленного', async () => {
    const { changes } = raise({ 'src/a.ts': 'modified' });
    changes.message.value = 'начатое';
    await changes.toggleAmend();
    changes.message.value = 'сообщение прошлого коммита, дополненное';

    await changes.toggleAmend();
    expect(changes.message.value).toBe('сообщение прошлого коммита, дополненное');
  });

  it('галка «все» переключает в обе стороны', () => {
    const { changes } = raise({ 'src/a.ts': 'modified', 'src/b.ts': 'modified' });
    changes.toggleAll();
    expect(changes.picked.value).toEqual([]);
    changes.toggleAll();
    expect(changes.picked.value).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
