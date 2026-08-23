import { describe, expect, it } from 'vitest';
import { headFor, headText } from '../src/state/git-marks.js';

describe('текст из коммита принадлежит файлу', () => {
  it('ответ про этот файл — берём', () => {
    headText.value = { path: 'a.ts', text: 'было' };
    expect(headFor('a.ts')).toBe('было');
  });

  it('ответ про соседний файл — не берём', () => {
    headText.value = { path: 'a.ts', text: 'было' };
    expect(headFor('b.ts')).toBe(null);
  });

  it('ответа ещё нет — полосок нет', () => {
    headText.value = null;
    expect(headFor('a.ts')).toBe(null);
  });

  it('файла не было в истории — это тоже ответ, и он пустой', () => {
    headText.value = { path: 'new.ts', text: null };
    expect(headFor('new.ts')).toBe(null);
  });
});
