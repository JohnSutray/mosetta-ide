import { describe, expect, it } from 'vitest';
import { GitMarks } from '../src/marks.js';

function remoteAnswering(answers: Record<string, string | null>) {
  return {
    head: async (path: string) => ({ path, text: answers[path] ?? null }),
  };
}

describe('текст из коммита принадлежит файлу', () => {
  it('ответ про этот файл — берём', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'было' }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toEqual({ path: 'a.ts', text: 'было' });
  });

  it('ответ про соседний файл — не берём', async () => {
    const marks = new GitMarks({ head: async () => ({ path: 'b.ts', text: 'чужое' }) }, () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });

  it('закрыли файл — ответа нет и полосок нет', async () => {
    const marks = new GitMarks(remoteAnswering({ 'a.ts': 'было' }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    await marks.load(null);
    expect(marks.head.value).toBe(null);
  });

  it('файла не было в истории — это тоже ответ, и он пустой', async () => {
    const marks = new GitMarks(remoteAnswering({ 'new.ts': null }), () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('new.ts');
    expect(marks.head.value).toEqual({ path: 'new.ts', text: null });
  });

  it('сервер отказал — считаем, что истории нет', async () => {
    const marks = new GitMarks({
      head: async () => {
        throw new Error('не репозиторий');
      },
    }, () => ({ openDoc: { value: null }, replaceText: () => undefined }) as never);
    await marks.load('a.ts');
    expect(marks.head.value).toBe(null);
  });
});

describe('откат куска зовёт СОСЕДСКУЮ дверь (правка 18.09)', () => {
  it('текст уходит через `replaceText`, а не через `editDoc`', () => {
    const asked: string[] = [];
    const docs = () =>
      ({
        openDoc: { value: { path: 'a.ts', text: 'один\nдва\nтри\n' } },
        replaceText: (text: string) => asked.push(text),
      }) as never;
    const marks = new GitMarks({ head: async (path: string) => ({ path, text: null }) }, docs);

    marks.show({ kind: 'modified', from: 2, to: 2, before: ['ДВА'] }, { top: 0, left: 0, bottom: 0 });
    marks.revertOpen();

    expect(asked).toEqual(['один\nДВА\nтри\n']);
  });

  it('откат не снимает у файла последний перевод строки (правка 18.09)', () => {
    const asked: string[] = [];
    const docs = () =>
      ({
        openDoc: { value: { path: 'a.ts', text: 'один\nдва\n' } },
        replaceText: (text: string) => asked.push(text),
      }) as never;
    const marks = new GitMarks({ head: async (path: string) => ({ path, text: null }) }, docs);

    marks.show({ kind: 'added', from: 2, to: 2, before: [] }, { top: 0, left: 0, bottom: 0 });
    marks.revertOpen();

    expect(asked).toEqual(['один\n']);
  });
});
