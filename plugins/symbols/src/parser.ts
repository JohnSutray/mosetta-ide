import path from 'node:path';
import { createRequire } from 'node:module';
import type { Logger, ProcessHandle, Project } from '@mosetta/ide-api/server';
import type { TsSymbol } from './ts-symbols.js';

export interface ParseAsk {
  path: string;
  text: string;
  ext: string;
}

export class SymbolParser {
  private live: ProcessHandle | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private rest = '';
  private next = 1;
  private readonly waiting = new Map<number, (files: Record<string, TsSymbol[]>) => void>();

  constructor(
    private readonly project: Project,
    private readonly dir: string,
    private readonly log: Logger,
    private readonly idleMs = 60_000,
    private readonly budgetMb = 700,
  ) {}

  async parse(files: ParseAsk[]): Promise<Record<string, TsSymbol[]>> {
    if (files.length === 0) return {};
    let child: ProcessHandle;
    try {
      child = this.wake();
    } catch (err) {
      this.log.warn(`символы: не запустился разборщик — ${String(err)}`);
      return {};
    }
    const id = this.next++;
    const answer = new Promise<Record<string, TsSymbol[]>>((resolve) => {
      this.waiting.set(id, resolve);
    });
    child.child.stdin?.write(`${JSON.stringify({ id, files })}\n`);
    const parsed = await answer;
    void this.afterBatch();
    return parsed;
  }

  stop(): void {
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    for (const resolve of this.waiting.values()) resolve({});
    this.waiting.clear();
    this.live?.kill();
    this.live = null;
    this.rest = '';
  }

  dispose(): void {
    this.stop();
  }

  get running(): boolean {
    return this.live !== null;
  }

  private wake(): ProcessHandle {
    if (this.live) return this.live;
    const script = path.join(this.dir, 'src', 'parse-child.mjs');
    const anchor = path.join(this.dir, 'package.json');
    createRequire(anchor).resolve('typescript');
    const handle = this.project.start({
      command: process.execPath,
      args: [script, anchor],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      reason: 'ts symbols',
    });
    handle.child.stdout.on('data', (chunk) => this.feed(Buffer.from(chunk).toString('utf8')));
    handle.child.on('exit', () => {
      if (this.live === handle) this.live = null;
      for (const resolve of this.waiting.values()) resolve({});
      this.waiting.clear();
    });
    this.live = handle;
    return handle;
  }

  private feed(chunk: string): void {
    this.rest += chunk;
    let at = this.rest.indexOf('\n');
    while (at >= 0) {
      const line = this.rest.slice(0, at);
      this.rest = this.rest.slice(at + 1);
      at = this.rest.indexOf('\n');
      if (line.trim() === '') continue;
      try {
        const answer = JSON.parse(line) as { id: number; files: Record<string, TsSymbol[]>; failed?: string };
        if (answer.failed) this.log.warn(`символы: разборщик споткнулся — ${answer.failed}`);
        this.waiting.get(answer.id)?.(answer.files ?? {});
        this.waiting.delete(answer.id);
      } catch {}
    }
  }

  private async afterBatch(): Promise<void> {
    if (this.idle) clearTimeout(this.idle);
    const taken = (await this.live?.memoryMb()) ?? 0;
    if (taken > this.budgetMb) {
      this.log.info(`символы: разборщик взял ${Math.round(taken)} МБ — перезапускаю`);
      this.stop();
      return;
    }
    this.idle = setTimeout(() => {
      this.idle = null;
      this.stop();
    }, this.idleMs);
    this.idle.unref?.();
  }
}
