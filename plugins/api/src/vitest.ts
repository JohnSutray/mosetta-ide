export function pluginTests(): Record<string, unknown> {
  return {
    resolve: {
      alias: {
        '@ide/api/client': '@ide/api/testing',
      },
    },
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'preact',
    },
    test: {
      environment: 'node',
      setupFiles: ['@ide/api/browser-globals'],
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    },
  };
}
