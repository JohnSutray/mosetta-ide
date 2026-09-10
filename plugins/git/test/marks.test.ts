import { describe, expect, it } from 'vitest';
import { GitMarks } from '../src/marks.js';

function remoteAnswering(answers: Record<string, string | null>) {
  return {
    head: async (path: string) => ({ path, text: answers[path] ?? null }),
  };
}

describe('текст из коммита принадлежит файлу', () => {
  it('ответ про этот файл — берём', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'было' }), () => ({ openDoc: { value: null }, editDoc: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toEqual({ path: 'a.ts', text: 'было' });
  });

  it('ответ про соседний файл — не берём', async () => {
    const marks = new GitMarks({ head: async () => ({ path: 'b.ts', text: 'чужое' }) }, () => ({ openDoc: { value: null }, editDoc: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });

  it('закрыли файл — ответа нет и полосок нет', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'было' }), () => ({ openDoc: { value: null }, editDoc: () => undefined }) as never);
    await marks.load('a.ts');
    await marks.load(null);
    expect(marks.head.value).toBe(null);
  });

  it('файла не было в истории — это тоже ответ, и он пустой', async () => {
    const marks = new GitMarks(remoteAnswering({ 'new.ts': null }), () => ({ openDoc: { value: null }, editDoc: () => undefined }) as never);
    await marks.load('new.ts');
    expect(marks.head.value).toEqual({ path: 'new.ts', text: null });
  });

  it('сервер отказал — считаем, что истории нет', async () => {
    const marks = new GitMarks({
      head: async () => {
        throw new Error('не репозиторий');
      },
    }, () => ({ openDoc: { value: null }, editDoc: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });
});
