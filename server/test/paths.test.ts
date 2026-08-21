import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { toKey, toAbsolute, toRelative, isInside, joinKey, extensionOf } from '../src/workspace/paths.js';

const root = path.resolve('/tmp/project');

describe('ключи и пути', () => {
  it('корень — пустая строка', () => {
    expect(toKey('')).toBe('');
    expect(toAbsolute(root, '')).toBe(root);
  });

  it('ключ всегда со слэшем, диск — в разделителях ОС', () => {
    expect(toKey('src\\app\\main.ts')).toBe('src/app/main.ts');
    expect(toAbsolute(root, 'src/app/main.ts')).toBe(
      path.join(root, 'src', 'app', 'main.ts'),
    );
  });

  it('обратно получается тот же ключ', () => {
    const abs = toAbsolute(root, 'src/app/main.ts');
    expect(toRelative(root, abs)).toBe('src/app/main.ts');
  });

  it('лишние сегменты схлопываются', () => {
    expect(toKey('./src//app/./main.ts')).toBe('src/app/main.ts');
  });

  it('.. внутри проекта разрешён', () => {
    expect(toKey('src/app/../main.ts')).toBe('src/main.ts');
  });

  it.each([
    ['..', 'выход вверх'],
    ['../secrets', 'выход вверх с хвостом'],
    ['src/../../secrets', 'выход вверх через середину'],
    ['/etc/passwd', 'абсолютный posix'],
    ['C:/Windows/System32', 'абсолютный windows'],
    ['\\\\server\\share', 'UNC'],
    ['src/\0/x', 'NUL-байт'],
  ])('отвергает %s (%s)', (bad) => {
    expect(() => toKey(bad)).toThrow();
  });

  it('сосед с похожим именем не считается потомком', () => {
    expect(isInside(root, `${root}-secret`)).toBe(false);
    expect(isInside(root, path.join(root, 'src'))).toBe(true);
  });

  it('склейка и расширение', () => {
    expect(joinKey('', 'a.ts')).toBe('a.ts');
    expect(joinKey('src', 'a.ts')).toBe('src/a.ts');
    expect(extensionOf('src/a.d.ts')).toBe('ts');
    expect(extensionOf('src/Makefile')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
  });
});
