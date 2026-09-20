import { defineConfig } from 'vitest/config';

/**
 * The browser checks are slow and use a real Chrome, so they are not part of `pnpm
 * test`: they are called with `pnpm test:e2e`. One file at a time: the stand brings up
 * a server, Vite and a browser, and there is no point sharing them between files.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
