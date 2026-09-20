import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { paths } from '../src/workspace/paths.js';

const root = path.resolve('/tmp/project');

describe('keys and paths', () => {
  it('the root is the empty string', () => {
    expect(paths.toKey('')).toBe('');
    expect(paths.toAbsolute(root, '')).toBe(root);
  });

  it('a key always uses a forward slash, a disk path the OS separators', () => {
    expect(paths.toKey('src\\app\\main.ts')).toBe('src/app/main.ts');
    expect(paths.toAbsolute(root, 'src/app/main.ts')).toBe(
      path.join(root, 'src', 'app', 'main.ts'),
    );
  });

  it('the same key comes back', () => {
    const abs = paths.toAbsolute(root, 'src/app/main.ts');
    expect(paths.toRelative(root, abs)).toBe('src/app/main.ts');
  });

  it('redundant segments collapse', () => {
    expect(paths.toKey('./src//app/./main.ts')).toBe('src/app/main.ts');
  });

  it('a .. inside the project is allowed', () => {
    expect(paths.toKey('src/app/../main.ts')).toBe('src/main.ts');
  });

  it.each([
    ['..', 'escaping upwards'],
    ['../secrets', 'escaping upwards with a tail'],
    ['src/../../secrets', 'escaping upwards through the middle'],
    ['/etc/passwd', 'an absolute posix path'],
    ['C:/Windows/System32', 'an absolute windows path'],
    ['\\\\server\\share', 'UNC'],
    ['src/\0/x', 'a NUL byte'],
  ])('rejects %s (%s)', (bad) => {
    expect(() => paths.toKey(bad)).toThrow();
  });

  it('a neighbour with a similar name does not count as a descendant', () => {
    expect(paths.isInside(root, `${root}-secret`)).toBe(false);
    expect(paths.isInside(root, path.join(root, 'src'))).toBe(true);
  });

  it('joining and extensions', () => {
    expect(paths.joinKey('', 'a.ts')).toBe('a.ts');
    expect(paths.joinKey('src', 'a.ts')).toBe('src/a.ts');
    expect(paths.extensionOf('src/a.d.ts')).toBe('ts');
    expect(paths.extensionOf('src/Makefile')).toBe('');
    expect(paths.extensionOf('.gitignore')).toBe('');
  });
});
