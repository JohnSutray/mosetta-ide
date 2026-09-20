import path from 'node:path';
import { createRequire } from 'node:module';
import type { Logger, ProcessHandle, Project } from '@mosetta/ide-api/server';
import type { TsSymbol } from './ts-symbols.js';

/** A file handed over to be parsed. */
export interface ParseAsk {
  path: string;
  text: string;
  ext: string;
}

/**
 * Parsing symbols in a child process.
 *
 * The measurement it was all for: on a built 760 KB bundle the parser cost the daemon
 * 61 MB of RSS, and after garbage collection it did not come back — V8 does not return
 * its arena to the operating system. The same parsing in a process that exits leaves
 * the daemon only the result: 1.6 MB.
 *
 * There is ONE process per project and it lives while it is being used: bringing
 * TypeScript itself up costs a quarter of a second, and paying that on every save would
 * be worse than the ailment. We kill it on idleness and on crossing a memory threshold
 * — the same device as the project sweep uses, and for the same reason: somebody else's
 * parser is not obliged to be tidy, and we are.
 */
export class SymbolParser {
  private live: ProcessHandle | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private rest = '';
  private next = 1;
  private readonly waiting = new Map<number, (files: Record<string, TsSymbol[]>) => void>();

  constructor(
    private readonly project: Project,
    /** The package's directory: `import.meta.url` lies in a built half. */
    private readonly dir: string,
    private readonly log: Logger,
    /** How long to wait with no work before letting the process go. */
    private readonly idleMs = 60_000,
    /** The memory threshold: past it the process is restarted between batches. */
    private readonly budgetMb = 700,
  ) {}

  /** Parse a batch. The process refusing is an empty answer rather than an exception. */
  async parse(files: ParseAsk[]): Promise<Record<string, TsSymbol[]>> {
    if (files.length === 0) return {};
    let child: ProcessHandle;
    try {
      child = this.wake();
    } catch (err) {
      this.log.warn(`symbols: the parser did not start — ${String(err)}`);
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

  /** Let the process go: it will return everything it took to the operating system. */
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

  /** Whether the parser is alive right now — for a test and for the journal. */
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

  /** The answers arrive as lines: we glue the tail together and parse the whole ones. */
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
        if (answer.failed) this.log.warn(`symbols: the parser stumbled — ${answer.failed}`);
        this.waiting.get(answer.id)?.(answer.files ?? {});
        this.waiting.delete(answer.id);
      } catch {}
    }
  }

  private async afterBatch(): Promise<void> {
    if (this.idle) clearTimeout(this.idle);
    const taken = (await this.live?.memoryMb()) ?? 0;
    if (taken > this.budgetMb) {
      this.log.info(`symbols: the parser took ${Math.round(taken)} MB — restarting it`);
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
