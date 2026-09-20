import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SymbolParser } from '../src/parser.js';
import type { Project, ProcessHandle } from '@mosetta/ide-api/server';

/**
 * Parsing symbols in a child process.
 *
 * The test goes into a REAL child process: a fake would check our belief about its
 * habits rather than the habits — the same rule as with the debugger. We check exactly
 * what it exists for: the symbols are the same as parsing in place gives, and the
 * memory leaves with the process.
 */

const dir = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const silent = { debug() {}, info() {}, warn() {}, error() {} };

/** A project of which the parser needs exactly one method. */
function stand(): { project: Project; alive: () => number } {
  const kids = new Set<ChildProcess>();
  const project = {
    start: (ask: { command: string; args?: string[]; env?: Record<string, string> }): ProcessHandle => {
      const child = spawn(ask.command, ask.args ?? [], { env: { ...process.env, ...ask.env }, stdio: 'pipe' });
      kids.add(child);
      child.on('exit', () => kids.delete(child));
      return {
        child: child as never,
        kill: () => child.kill(),
        memoryMb: async () => 0,
      };
    },
  } as unknown as Project;
  return { project, alive: () => kids.size };
}

describe('the symbol parser in its own process', () => {
  let parser: SymbolParser | null = null;
  afterEach(() => parser?.dispose());

  it('finds the same as parsing in place', async () => {
    const { project } = stand();
    parser = new SymbolParser(project, dir, silent);
    const parsed = await parser.parse([
      {
        path: 'src/a.ts',
        ext: 'ts',
        text: 'export class Box {\n  size = 1;\n  grow() {}\n}\nexport function make() {}\nexport type Id = string;\n',
      },
    ]);
    const names = (parsed['src/a.ts'] ?? []).map((one) => `${one.kind}:${one.name}`);
    expect(names).toEqual(['class:Box', 'property:Box.size', 'method:Box.grow()', 'function:make', 'type:Id']);
  }, 60_000);

  it('in a batch: one process answers for several files', async () => {
    const { project } = stand();
    parser = new SymbolParser(project, dir, silent);
    const parsed = await parser.parse([
      { path: 'a.ts', ext: 'ts', text: 'export const a = 1;\n' },
      { path: 'b.tsx', ext: 'tsx', text: 'export function B() { return null; }\n' },
    ]);
    expect(parsed['a.ts']?.[0]?.name).toBe('a');
    expect(parsed['b.tsx']?.[0]?.name).toBe('B');
  }, 60_000);

  it('a broken file does not take the batch with it', async () => {
    const { project } = stand();
    parser = new SymbolParser(project, dir, silent);
    const parsed = await parser.parse([
      { path: 'broken.ts', ext: 'ts', text: 'class {{{ rubbish\n' },
      { path: 'fine.ts', ext: 'ts', text: 'export const ok = 1;\n' },
    ]);
    expect(parsed['fine.ts']?.[0]?.name, 'the neighbour was parsed').toBe('ok');
  }, 60_000);

  it('the process leaves on request — and takes all its memory with it', async () => {
    const { project, alive } = stand();
    parser = new SymbolParser(project, dir, silent);
    await parser.parse([{ path: 'a.ts', ext: 'ts', text: 'export const a = 1;\n' }]);
    expect(parser.running).toBe(true);
    parser.stop();
    expect(parser.running).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(alive()).toBe(0);
  }, 60_000);
});
