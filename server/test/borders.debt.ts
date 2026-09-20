/**
 * The package border's debt: imports that go past an instance. The list ONLY shrinks —
 * the test fails both on a new violation and on one that was fixed but not struck off.
 * Empty means the border holds everywhere.
 *
 * Rebuild it after a move: `BORDER_DUMP=1 npx vitest run test/borders.test.ts` prints
 * the current list whole.
 */
export const BORDER_DEBT: readonly string[] = [];
