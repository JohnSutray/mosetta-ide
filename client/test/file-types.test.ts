import { describe, expect, it } from 'vitest';
import { fileTypes } from '@ide/ui';

describe('тип файла по имени', () => {
  it('расширение узнаётся в любом регистре', () => {
    expect(fileTypes.of('index.ts').label).toBe('TS');
    expect(fileTypes.of('Index.TS').label).toBe('TS');
    expect(fileTypes.of('app.tsx').label).toBe('TSX');
  });

  it('имя целиком сильнее расширения', () => {
    expect(fileTypes.of('package.json').label).toBe('npm');
    expect(fileTypes.of('config.json').label).toBe('{}');
  });

  it('хвост сильнее расширения: объявления и сборочный мусор', () => {
    expect(fileTypes.of('globals.d.ts').label).toBe('D');
    expect(fileTypes.of('app.tsbuildinfo').label).toBe('··');
    expect(fileTypes.of('server.ts').label).toBe('TS');
  });

  it('семейство конфигов узнаётся по началу имени', () => {
    expect(fileTypes.of('tsconfig.json').label).toBe('TS');
    expect(fileTypes.of('tsconfig.build.json').label).toBe('TS');
  });

  it('файл без расширения и точка-файл не ломают разбор', () => {
    expect(fileTypes.of('.gitignore').label).toBe('git');
    expect(fileTypes.of('LICENSE')).toEqual(fileTypes.plain);
    expect(fileTypes.of('')).toEqual(fileTypes.plain);
  });

  it('незнакомое расширение — просто лист бумаги, а не выдуманная подпись', () => {
    expect(fileTypes.of('archive.qqq')).toEqual(fileTypes.plain);
  });

  it('подпись влезает в плашку, а цвета настоящие', () => {
    const all = fileTypes.all();
    for (const type of all) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.label.length).toBeLessThanOrEqual(3);
      expect(type.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(type.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('ключи таблиц записаны в нижнем регистре — иначе строка мертва', () => {
    const keys = fileTypes.keys();
    for (const key of keys) expect(key).toBe(key.toLowerCase());
  });
});
