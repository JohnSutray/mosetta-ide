import fs from 'node:fs/promises';
import path from 'node:path';

/** How many names we remember: beyond that the rarest drop out. */
const LIMIT = 500;

/**
 * The history of choices on disk.
 *
 * The MACHINE's state rather than a project's or a setting: it may not go into the
 * config directory — git would be dirtied after every Enter; it may not go into
 * `localStorage` — there every address has its own history, and two tabs overwrote each
 * other's choices because they wrote the whole map. Here there is one server, a choice
 * is ADDED to a counter, and writes go one at a time: two choices at once from two tabs
 * are both counted.
 *
 * The directory arrives from outside (`ide.state`): everything the server writes
 * outside the project arrives as a parameter. The file is written through a temporary
 * one and a rename — an interrupted write will not leave half a file.
 */
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

  /** Count a choice; the answer is how many times this name has been chosen now. */
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

  /** We read once: after that the truth is in memory, and the file catches up. */
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

  /** The rarest leave; what was just chosen, never. */
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
