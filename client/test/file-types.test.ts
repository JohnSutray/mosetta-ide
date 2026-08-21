import { describe, expect, it } from 'vitest';
import {
  BY_EXTENSION,
  BY_NAME,
  BY_PREFIX,
  BY_SUFFIX,
  PLAIN,
  fileType,
} from '../src/ui/file-types.js';

describe('тип файла по имени', () => {
  it('расширение узнаётся в любом регистре', () => {
    expect(fileType('index.ts').label).toBe('TS');
    expect(fileType('Index.TS').label).toBe('TS');
    expect(fileType('app.tsx').label).toBe('TSX');
  });

  it('имя целиком сильнее расширения', () => {
    expect(fileType('package.json').label).toBe('npm');
    expect(fileType('config.json').label).toBe('{}');
  });

  it('хвост сильнее расширения: объявления и сборочный мусор', () => {
    expect(fileType('globals.d.ts').label).toBe('D');
    expect(fileType('app.tsbuildinfo').label).toBe('··');
    expect(fileType('server.ts').label).toBe('TS');
  });

  it('семейство конфигов узнаётся по началу имени', () => {
    expect(fileType('tsconfig.json').label).toBe('TS');
    expect(fileType('tsconfig.build.json').label).toBe('TS');
  });

  it('файл без расширения и точка-файл не ломают разбор', () => {
    expect(fileType('.gitignore').label).toBe('git');
    expect(fileType('LICENSE')).toEqual(PLAIN);
    expect(fileType('')).toEqual(PLAIN);
  });

  it('незнакомое расширение — просто лист бумаги, а не выдуманная подпись', () => {
    expect(fileType('archive.qqq')).toEqual(PLAIN);
  });

  it('подпись влезает в плашку, а цвета настоящие', () => {
    const all = [
      ...Object.values(BY_EXTENSION),
      ...Object.values(BY_NAME),
      ...BY_SUFFIX.map(([, value]) => value),
      ...BY_PREFIX.map(([, value]) => value),
    ];
    for (const type of all) {
      expect(type.label.length).toBeGreaterThan(0);
      expect(type.label.length).toBeLessThanOrEqual(3);
      expect(type.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(type.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('ключи таблиц записаны в нижнем регистре — иначе строка мертва', () => {
    const keys = [
      ...Object.keys(BY_EXTENSION),
      ...Object.keys(BY_NAME),
      ...BY_SUFFIX.map(([key]) => key),
      ...BY_PREFIX.map(([key]) => key),
    ];
    for (const key of keys) expect(key).toBe(key.toLowerCase());
  });
});
