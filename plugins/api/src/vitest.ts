/**
 * The vitest setup for a plugin's tests.
 *
 * ```ts
 * // plugins/<something>/vitest.config.ts
 * import { pluginTests } from '@mosetta/ide-api/vitest';
 * export default pluginTests();
 * ```
 *
 * One line here matters — substituting `@mosetta/ide-api/client` with the stub.
 * That is exactly what the real build does: half the contract is declared
 * without any code behind it, and without the substitution a plugin's module
 * would not link. In the browser esbuild substitutes it, in a test vite does;
 * what gets substituted is the same.
 *
 * A preset rather than a copy in every plugin: the substitution is part of the
 * contract, and four copies of it would drift on the first edit.
 */
export function pluginTests(): Record<string, unknown> {
  return {
    resolve: {
      alias: {
        '@mosetta/ide-api/client': '@mosetta/ide-api/testing',
      },
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    test: {
      environment: 'node',
      setupFiles: ['@mosetta/ide-api/browser-globals'],
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    },
  };
}
