

/** How to run `ps`: exactly as much as we need from the process ledger. */
export interface Runner {
  run(spec: { command: string; args: string[]; reason: string; timeoutMs?: number }): Promise<{
    ok: boolean;
    stdout: string;
  }>;
}

/** How long we wait for `ps`. It is instant; if it is not, we no longer need the answer. */
const PATIENCE_MS = 2000;

/** A row of the process table: who, whose, and how much it holds. */
export interface ProcessRow {
  pid: number;
  ppid: number;
  kb: number;
}

export class ProcessMemory {
  /**
   * The process ledger, lazily: `Processes` holds us and we hold it, so the reference
   * has to be deferred. Without it there is nothing to measure with, and that is not an
   * error: it means `null`, it means "we do not know".
   */
  constructor(private readonly runner: () => Runner | null = () => null) {}

  /**
   * Whether we can measure on this system at all.
   *
   * Named separately, because "we cannot" is a property of the machine rather than an
   * error, and it has to be said out loud rather than returned as a silent zero: a
   * budget that always adds up is worse than no budget.
   */
  get measurable(): boolean {
    return process.platform !== 'win32';
  }

  /**
   * The resident megabytes of a process and all its descendants. `null` means measuring
   * is impossible (wrong system, or `ps` did not answer).
   */
  async treeMb(pid: number | undefined): Promise<number | null> {
    if (pid === undefined || !this.measurable) return null;
    const rows = await this.snapshot();
    if (!rows) return null;
    return Math.round(this.subtreeKb(rows, pid) / 1024);
  }

  /**
   * How much the descendants hold ONLY, without the process itself.
   *
   * Computed here rather than by subtracting on the client: our own number there comes
   * from Node (`process.memoryUsage().rss`) while the tree comes from `ps`, and the
   * difference between two DIFFERENT sources can go negative out of nowhere. Taken from
   * one snapshot it is honest.
   */
  async kidsMb(pid: number | undefined): Promise<number | null> {
    if (pid === undefined || !this.measurable) return null;
    const rows = await this.snapshot();
    if (!rows) return null;
    const own = rows.find((row) => row.pid === pid)?.kb ?? 0;
    return Math.round(Math.max(0, this.subtreeKb(rows, pid) - own) / 1024);
  }

  /**
   * One snapshot of the whole process table. In a single call rather than per process:
   * the tree is not known in advance, and a system-wide `ps` costs the same as one for
   * a single pid.
   */
  private async snapshot(): Promise<ProcessRow[] | null> {
    const runner = this.runner();
    if (!runner) return null;
    const ran = await runner.run({
      command: 'ps',
      args: ['-Ao', 'pid=,ppid=,rss='],
      reason: 'process tree memory',
      timeoutMs: PATIENCE_MS,
    });
    if (!ran.ok) return null;
    return this.parse(ran.stdout);
  }

  /** Parsing `ps` output. Public and pure: that is how it gets tested. */
  parse(out: string): ProcessRow[] | null {
    const rows: ProcessRow[] = [];
    for (const line of out.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = Number(parts[0]);
      const ppid = Number(parts[1]);
      const kb = Number(parts[2]);
      if (!Number.isFinite(pid) || !Number.isFinite(ppid) || !Number.isFinite(kb)) continue;
      rows.push({ pid, ppid, kb });
    }
    return rows.length > 0 ? rows : null;
  }

  /**
   * The pids of a subtree, root first.
   *
   * The same walk as the memory sum uses, but without the arithmetic: needed by whoever
   * KILLS the tree. Public and pure for the same reason — the walk is the whole point,
   * and checking it by running `ps` would mean checking `ps`.
   */
  subtree(rows: ProcessRow[], root: number): number[] {
    const children = new Map<number, number[]>();
    for (const row of rows) {
      const list = children.get(row.ppid);
      if (list) list.push(row.pid);
      else children.set(row.ppid, [row.pid]);
    }
    const out: number[] = [];
    const queue = [root];
    const seen = new Set<number>();
    while (queue.length > 0) {
      const pid = queue.shift()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      out.push(pid);
      queue.push(...(children.get(pid) ?? []));
    }
    return out;
  }

  /**
   * A process's descendants, without the process itself. `null` means measuring is
   * impossible.
   */
  async descendants(pid: number | undefined): Promise<number[] | null> {
    if (pid === undefined || !this.measurable) return null;
    const rows = await this.snapshot();
    if (!rows) return null;
    return this.subtree(rows, pid).filter((one) => one !== pid);
  }

  subtreeKb(rows: ProcessRow[], root: number): number {
    const children = new Map<number, number[]>();
    const own = new Map<number, number>();
    for (const row of rows) {
      own.set(row.pid, row.kb);
      const list = children.get(row.ppid);
      if (list) list.push(row.pid);
      else children.set(row.ppid, [row.pid]);
    }

    let total = 0;
    const queue = [root];
    const seen = new Set<number>();
    while (queue.length > 0) {
      const pid = queue.pop()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      total += own.get(pid) ?? 0;
      for (const kid of children.get(pid) ?? []) queue.push(kid);
    }
    return total;
  }
}
