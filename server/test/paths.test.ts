import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { normalizeRelative, resolveInRoot, toRelative, isInside } from '../src/workspace/paths.js';

const root = path.resolve('/tmp/project');

describe('пути протокола', () => {
  it('корень — пустая строка', () => {
    expect(resolveInRoot(root, '')).toBe(root);
  });

  it('слэш в протоколе превращается в разделитель ОС', () => {
    expect(resolveInRoot(root, 'src/app/main.ts')).toBe(
      path.join(root, 'src', 'app', 'main.ts'),
    );
  });

  it('обратно получается тот же путь протокола', () => {
    const abs = resolveInRoot(root, 'src/app/main.ts');
    expect(toRelative(root, abs)).toBe('src/app/main.ts');
  });

  it('лишние сегменты схлопываются', () => {
    expect(normalizeRelative('./src//app/./main.ts')).toBe(
      path.join('src', 'app', 'main.ts'),
    );
  });

  it('.. внутри проекта разрешён', () => {
    expect(resolveInRoot(root, 'src/app/../main.ts')).toBe(path.join(root, 'src', 'main.ts'));
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
    expect(() => resolveInRoot(root, bad)).toThrow();
  });

  it('сосед с похожим именем не считается потомком', () => {
    expect(isInside(root, `${root}-secret`)).toBe(false);
    expect(isInside(root, path.join(root, 'src'))).toBe(true);
  });
});
