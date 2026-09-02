
const globals = globalThis as Record<string, unknown>;

globals['self'] ??= globalThis;

globals['navigator'] ??= { userAgent: 'node' };
