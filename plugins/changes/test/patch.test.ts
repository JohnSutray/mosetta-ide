import { describe, expect, it } from 'vitest';
import { PatchReader } from '../src/patch.js';

/**
 * Reading a patch off the shelf.
 *
 * The patches here are REAL — taken with `git diff`, with all its habits: the `diff
 * --git` heading, the counting of rows in `@@`, the "\ No newline at end of file". A
 * fake would be checking our belief in the format rather than the format.
 */

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

describe('a patch off the shelf', () => {
  it('it is broken up into files and hunks', () => {
    const files = reader.read(PATCH);
    expect(files).toHaveLength(1);
    expect(files[0]!.path).toBe('src/a.ts');
    expect(files[0]!.binary).toBe(false);
    expect(files[0]!.hunks[0]).toMatchObject({ from: 1, count: 3 });
  });

  it('it lays onto the text from the commit', () => {
    const files = reader.read(PATCH);
    expect(reader.apply('one\ntwo\nthree\n', files[0]!.hunks)).toBe('one\nTWO\ntwo and a half\nthree\n');
  });

  it('it does not lay onto somebody else\'s text — and says so rather than showing something similar', () => {
    const files = reader.read(PATCH);
    expect(reader.apply('one\nWHAT\nthree\n', files[0]!.hunks)).toBe(null);
  });

  it('a new file: the patch lays onto emptiness whole', () => {
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

  it('a binary file is called binary rather than shown empty', () => {
    const binary = `diff --git a/logo.png b/logo.png
index 1234567..89abcde 100644
GIT binary patch
literal 12
`;
    expect(reader.read(binary)[0]).toMatchObject({ path: 'logo.png', binary: true });
  });

  it('several files in one patch are parsed one by one', () => {
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

  it('an empty context line is a line rather than the end of a hunk', () => {
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
