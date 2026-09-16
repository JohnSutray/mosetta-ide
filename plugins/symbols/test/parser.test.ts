import { afterEach, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SymbolParser } from '../src/parser.js';
import type { Project, ProcessHandle } from '@mosetta/ide-api/server';

const dir = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const silent = { debug() {}, info() {}, warn() {}, error() {} };

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

describe('разборщик символов в своём процессе', () => {
  let parser: SymbolParser | null = null;
  afterEach(() => parser?.dispose());

  it('находит то же, что и разбор на месте', async () => {
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

  it('пачкой: один процесс отвечает на несколько файлов', async () => {
    const { project } = stand();
    parser = new SymbolParser(project, dir, silent);
    const parsed = await parser.parse([
      { path: 'a.ts', ext: 'ts', text: 'export const a = 1;\n' },
      { path: 'b.tsx', ext: 'tsx', text: 'export function B() { return null; }\n' },
    ]);
    expect(parsed['a.ts']?.[0]?.name).toBe('a');
    expect(parsed['b.tsx']?.[0]?.name).toBe('B');
  }, 60_000);

  it('сломанный файл не уносит пачку', async () => {
    const { project } = stand();
    parser = new SymbolParser(project, dir, silent);
    const parsed = await parser.parse([
      { path: 'broken.ts', ext: 'ts', text: 'class {{{ мусор\n' },
      { path: 'fine.ts', ext: 'ts', text: 'export const ok = 1;\n' },
    ]);
    expect(parsed['fine.ts']?.[0]?.name, 'сосед разобран').toBe('ok');
  }, 60_000);

  it('процесс уходит по требованию — и уносит с собой всю свою память', async () => {
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
