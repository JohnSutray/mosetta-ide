

export interface Runner {
  run(spec: { command: string; args: string[]; reason: string; timeoutMs?: number }): Promise<{
    ok: boolean;
    stdout: string;
  }>;
}

const PATIENCE_MS = 2000;

export interface ProcessRow {
  pid: number;
  ppid: number;
  kb: number;
}

export class ProcessMemory {
  constructor(private readonly runner: () => Runner | null = () => null) {}

  get measurable(): boolean {
    return process.platform !== 'win32';
  }

  async treeMb(pid: number | undefined): Promise<number | null> {
    if (pid === undefined || !this.measurable) return null;
    const rows = await this.snapshot();
    if (!rows) return null;
    return Math.round(this.subtreeKb(rows, pid) / 1024);
  }

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
