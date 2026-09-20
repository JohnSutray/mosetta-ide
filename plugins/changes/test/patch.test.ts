import { describe, expect, it } from 'vitest';
import { PatchReader } from '../src/patch.js';

const reader = new PatchReader();

const PATCH = `diff --git a/src/a.ts b/src/a.ts
index 9af4e39..7fb0784 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 one
-two
+TWO
+two and a half
 three
`;

describe('патч с полки', () => {
  it('разбирается на файлы и куски', () => {
    const files = reader.read(PATCH);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/a.ts');
    expect(files[0]!.binary).toBe(false);
    expect(files[0]!.hunks[0]).toMatchObject({ from: 1, count: 3 });
  });

  it('накладывается на текст из коммита', () => {
    const files = reader.read(PATCH);
    expect(reader.apply('one\ntwo\nthree\n', files[0]!.hunks)).toBe('one\nTWO\ntwo and a half\nthree\n');
  });

  it('не ложится на чужой текст — и говорит об этом, а не показывает похожее', () => {
    const files = reader.read(PATCH);
    expect(reader.apply('one\nWHAT\nthree\n', files[0]!.hunks)).toBe(null);
  });

  it('новый файл: патч кладётся на пустоту целиком', () => {
    const born = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..8d3f17a
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+export const x = 1;
+export const y = 2;
`;
    const files = reader.read(born);
    expect(reader.apply('', files[0]!.hunks)).toBe('export const x = 1;\nexport const y = 2;');
  });

  it('двоичный файл назван двоичным, а не показан пустым', () => {
    const binary = `diff --git a/logo.png b/logo.png
index 1234567..89abcde 100644
GIT binary patch
literal 12
`;
    expect(reader.read(binary)[0]).toMatchObject({ path: 'logo.png', binary: true });
  });

  it('несколько файлов в одном патче разбираются по одному', () => {
    const two = `${PATCH}diff --git a/src/b.ts b/src/b.ts
index 1111111..2222222 100644
--- a/src/b.ts
+++ b/src/b.ts
@@ -2,2 +2,2 @@
-gone
+born
`;
    expect(reader.read(two).map((file) => file.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('пустая строка контекста — это строка, а не конец куска', () => {
    const patch = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,3 @@
 one

-three
+THREE
`;
    const files = reader.read(patch);
    expect(reader.apply('one\n\nthree\n', files[0]!.hunks)).toBe('one\n\nTHREE\n');
  });
});
