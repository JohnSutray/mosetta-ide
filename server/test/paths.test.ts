import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { paths } from '../src/workspace/paths.js';

const root = path.resolve('/tmp/project');

describe('ключи и пути', () => {
  it('корень — пустая строка', () => {
    expect(paths.toKey('')).toBe('');
    expect(paths.toAbsolute(root, '')).toBe(root);
  });

  it('ключ всегда со слэшем, диск — в разделителях ОС', () => {
    expect(paths.toKey('src\\app\\main.ts')).toBe('src/app/main.ts');
    expect(paths.toAbsolute(root, 'src/app/main.ts')).toBe(
      path.join(root, 'src', 'app', 'main.ts'),
    );
  });

  it('обратно получается тот же ключ', () => {
    const abs = paths.toAbsolute(root, 'src/app/main.ts');
    expect(paths.toRelative(root, abs)).toBe('src/app/main.ts');
  });

  it('лишние сегменты схлопываются', () => {
    expect(paths.toKey('./src//app/./main.ts')).toBe('src/app/main.ts');
  });

  it('.. внутри проекта разрешён', () => {
    expect(paths.toKey('src/app/../main.ts')).toBe('src/main.ts');
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
    expect(() => paths.toKey(bad)).toThrow();
  });

  it('сосед с похожим именем не считается потомком', () => {
    expect(paths.isInside(root, `${root}-secret`)).toBe(false);
    expect(paths.isInside(root, path.join(root, 'src'))).toBe(true);
  });

  it('склейка и расширение', () => {
    expect(paths.joinKey('', 'a.ts')).toBe('a.ts');
    expect(paths.joinKey('src', 'a.ts')).toBe('src/a.ts');
    expect(paths.extensionOf('src/a.d.ts')).toBe('ts');
    expect(paths.extensionOf('src/Makefile')).toBe('');
    expect(paths.extensionOf('.gitignore')).toBe('');
  });
});
