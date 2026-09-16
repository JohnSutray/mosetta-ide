import { describe, expect, it } from 'vitest';
import { signal } from '@preact/signals';
import type { GitState } from '@mosetta/ide-plugin-git';
import { Changes, type ChangesRemote } from '../src/state.js';
import type { ShelfItem } from '../src/shelf.js';

function snapshot(files: GitState['files']) {
  return signal<GitState>({ repo: true, branch: 'main', ahead: 0, behind: 0, files });
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
    async () => {
      rescans.push(1);
    },
  );
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
    expect(asked).toEqual([{ what: 'commit', ask: { message: 'правка', files: ['src/a.ts'], amend: false } }]);
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
    changes.message.value = 'потом доделаю';
    await changes.shelve();
    expect(asked).toEqual([{ what: 'shelve', ask: { name: 'потом доделаю', files: ['src/a.ts'] } }]);
    expect(changes.message.value, 'ушло вместе с патчем').toBe('');
  });

  it('галка «все» переключает в обе стороны', () => {
    const { changes } = raise({ 'src/a.ts': 'modified', 'src/b.ts': 'modified' });
    changes.toggleAll();
    expect(changes.picked.value).toEqual([]);
    changes.toggleAll();
    expect(changes.picked.value).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
