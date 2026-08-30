import { gitMarks } from '../src/state/git-marks.js';
import { describe, expect, it } from 'vitest';

describe('текст из коммита принадлежит файлу', () => {
  it('ответ про этот файл — берём', () => {
    gitMarks.head.value = { path: 'a.ts', text: 'было' };
    expect(gitMarks.headFor('a.ts')).toBe('было');
  });

  it('ответ про соседний файл — не берём', () => {
    gitMarks.head.value = { path: 'a.ts', text: 'было' };
    expect(gitMarks.headFor('b.ts')).toBe(null);
  });

  it('ответа ещё нет — полосок нет', () => {
    gitMarks.head.value = null;
    expect(gitMarks.headFor('a.ts')).toBe(null);
  });

  it('файла не было в истории — это тоже ответ, и он пустой', () => {
    gitMarks.head.value = { path: 'new.ts', text: null };
    expect(gitMarks.headFor('new.ts')).toBe(null);
  });
});
