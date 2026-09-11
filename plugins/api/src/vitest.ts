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
