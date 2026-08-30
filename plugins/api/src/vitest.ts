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
      include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    },
  };
}
