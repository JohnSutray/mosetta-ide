import fs from 'node:fs/promises';
import path from 'node:path';

const LIMIT = 500;

export class ChoiceStore {
  private counts: Promise<Record<string, number>> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dir: () => string,
    private readonly limit = LIMIT,
  ) {}

  async load(): Promise<Record<string, number>> {
    return { ...(await this.all()) };
  }

  add(label: string): Promise<number> {
    const run = this.queue.then(async () => {
      const counts = await this.all();
      counts[label] = (counts[label] ?? 0) + 1;
      this.prune(counts, label);
      await this.write(counts);
      return counts[label]!;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private all(): Promise<Record<string, number>> {
    this.counts ??= this.read();
    return this.counts;
  }

  private async read(): Promise<Record<string, number>> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await fs.readFile(this.file(), 'utf8'));
    } catch {
      return {};
    }
    const out: Record<string, number> = {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return out;
    for (const [label, times] of Object.entries(parsed)) {
      if (typeof times === 'number' && Number.isFinite(times) && times > 0) out[label] = times;
    }
    return out;
  }

  private async write(counts: Record<string, number>): Promise<void> {
    const file = this.file();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(counts), 'utf8');
    await fs.rename(`${file}.tmp`, file);
  }

  private prune(counts: Record<string, number>, keep: string): void {
    const names = Object.keys(counts).filter((name) => name !== keep);
    if (names.length < this.limit) return;
    names.sort((a, b) => counts[a]! - counts[b]!);
    for (const name of names.slice(0, names.length - this.limit + 1)) delete counts[name];
  }

  private file(): string {
    return path.join(this.dir(), 'choices.json');
  }
}
