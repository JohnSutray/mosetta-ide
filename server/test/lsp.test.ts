import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { RunningServer } from '../src/server.js';
import { connect, makeProject, removeProject, withServer, type TestClient } from './helpers.js';

/**
 * A real `typescript-language-server` on a real project, through the plugin door. This
 * is a DISTRIBUTION test rather than a core one: the core lends memory and spawns a
 * process, while everything about the language belongs to the plugin.
 *
 * The main thing here is not "diagnostics arrive" but WHERE the server takes its text
 * from. It reads the borrowed memory, which is why errors appear and disappear on
 * unsaved text. If someone one day switches it to disk, the test that falls over is
 * precisely the one about unsaved text.
 */

const CONFIG = fileURLToPath(new URL('./fixtures/lsp-config', import.meta.url));
const LSP = '@mosetta/ide-plugin-lsp';

/**
 * Whether the tool itself is installed on this machine.
 *
 * The test demands a REAL `typescript-language-server` — `pnpm install` does not bring
 * it, it is installed by hand. On a machine without it, six tests failed on a
 * forty-second timeout each: two minutes of waiting and a red test run with not one
 * breakage behind it.
 *
 * That costs more than it looks. Red that is "always red" stops being read: the next
 * real breakage arrives on the same line of the report and gets missed. The very first
 * run on Linux showed exactly that — nobody would have put six failures on trial.
 *
 * So it is a skip, but a LOUD one: silent truncation is the worst kind of error. There
 * is exactly one check and it is cheap — "does the command exist at all" — and it does
 * not stand in for the test: anything harder than a missing tool (the server is there
 * but does not answer; answers the wrong thing) still has to fail. A missing tool of
 * ANY kind is about the machine rather than about the code.
 */
function toolchainMissing(): string | null {
  try {
    execFileSync('typescript-language-server', ['--version'], { stdio: 'ignore', timeout: 10_000 });
    return null;
  } catch {
    return 'typescript-language-server is not installed on this machine';
  }
}

const MISSING = toolchainMissing();
if (MISSING) {
  console.warn(
    `[lsp] ${MISSING} — six tests skipped.\n` +
      '[lsp] to get them back: pnpm add -g typescript-language-server\n' +
      '[lsp] the "no server" badge itself is checked without it: plugins/lsp/test/dead-server.test.ts',
  );
}

interface Diagnostic {
  severity: string;
  message: string;
}
interface FileDiagnostics {
  path: string;
  diagnostics: Diagnostic[];
}
interface PluginEvent {
  name: string;
  event: string;
  payload: unknown;
}

describe.skipIf(MISSING)('the language server (plugin)', () => {
  let server: RunningServer;
  let root: string;
  let c: TestClient;

  const lsp = (method: string, params: unknown = null) => c.call('plugins.call', { name: LSP, method, params });

  beforeAll(async () => {
    root = await makeProject('lsp', {
      'tsconfig.json': JSON.stringify(
        { compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', noEmit: true } },
        null,
        2,
      ),
      'src/bad.ts': 'export const answer: number = "forty two";\n',
      'src/good.ts': 'export function twice(x: number): number {\n  return x * 2;\n}\n',
      'src/use.ts': 'const text = "abc";\ntext.\n',
      'src/auto.ts': 'twi\n',
    });
    server = await withServer(60_000, CONFIG);
    c = await connect(server);
    await c.call('workspace.open', { root });
  }, 60_000);

  afterAll(async () => {
    await c?.close();
    await server?.close();
    await removeProject(root);
  });

  it('comes up when the project opens rather than on the first .ts file', async () => {
    const deadline = Date.now() + 40_000;
    let status = (await lsp('status')) as Array<{ state: string }>;
    while (status[0]?.state !== 'ready' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      status = (await lsp('status')) as Array<{ state: string }>;
    }
    expect(status[0]?.state, JSON.stringify(status)).toBe('ready');
  }, 45_000);

  it('an error in an UNOPENED file is visible at once', async () => {
    const found = await waitForDiagnostics(c, 'src/bad.ts', (d) => d.length > 0);
    expect(found.diagnostics[0]?.severity).toBe('error');
    const known = (await lsp('problems')) as FileDiagnostics[];
    expect(known.some((f) => f.path === 'src/bad.ts')).toBe(true);
  }, 45_000);

  it('an error goes out on UNSAVED text — the memory is borrowed, not the disk', async () => {
    const doc = await c.call('doc.open', { path: 'src/bad.ts' });
    const waiting = waitForDiagnostics(c, 'src/bad.ts', (d) => d.length === 0);

    await c.call('doc.edit', {
      path: 'src/bad.ts',
      text: 'export const answer: number = 42;\n',
      baseVersion: doc.version,
    });
    const cleared = await waiting;
    expect(cleared.diagnostics).toEqual([]);

    const onDisk = await c.call('fs.read', { path: 'src/bad.ts' });
    expect(onDisk.text).toContain('forty two');
  }, 45_000);

  it('a hint brings the signature', async () => {
    await c.call('doc.open', { path: 'src/good.ts' });
    const hover = (await lsp('hover', { path: 'src/good.ts', line: 0, character: 17 })) as {
      markdown: string;
    } | null;
    expect(hover?.markdown ?? '').toMatch(/twice/);
    expect(hover?.markdown ?? '').toMatch(/number/);
  }, 45_000);

  it('completion after a dot — the type\'s members from the checker; resolve reads the signature in', async () => {
    await c.call('doc.open', { path: 'src/use.ts' });
    const answer = (await lsp('completion', { path: 'src/use.ts', line: 1, character: 5, trigger: '.' })) as {
      items: Array<{ label: string; kind: string; raw: unknown }>;
    };
    const upper = answer.items.find((item) => item.label === 'toUpperCase');
    expect(upper?.kind).toBe('method');
    const details = (await lsp('resolve', { path: 'src/use.ts', item: upper?.raw })) as { detail?: string };
    expect(details.detail ?? '').toMatch(/toUpperCase/);
  }, 45_000);

  it('auto-import: a name from a neighbouring module arrives with its import line', async () => {
    await c.call('doc.open', { path: 'src/auto.ts' });
    const answer = (await lsp('completion', { path: 'src/auto.ts', line: 0, character: 3 })) as {
      items: Array<{ label: string; imports?: boolean; raw: unknown }>;
    };
    const twice = answer.items.find((item) => item.label === 'twice');
    expect(twice?.imports).toBe(true);
    const details = (await lsp('resolve', { path: 'src/auto.ts', item: twice?.raw })) as {
      edits: Array<{ text: string }>;
    };
    expect(details.edits.map((edit) => edit.text).join('')).toMatch(/import \{ twice \} from ['"]\.\/good['"]/);
  }, 45_000);
});

function waitForDiagnostics(
  client: TestClient,
  path: string,
  accept: (diagnostics: Diagnostic[]) => boolean,
  timeoutMs = 40_000,
): Promise<FileDiagnostics> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async () => {
      const events = (client.events('plugins.event') as PluginEvent[])
        .filter((e) => e.name === LSP && e.event === 'diagnostics')
        .map((e) => e.payload as FileDiagnostics);
      const match = [...events].reverse().find((e) => e.path === path && accept(e.diagnostics));
      if (match) return resolve(match);
      if (Date.now() > deadline) {
        return reject(new Error(`never saw diagnostics for ${path}`));
      }
      setTimeout(() => void tick(), 150);
    };
    void tick();
  });
}
