import { batch, signal } from '@preact/signals';
import type { Step } from '@mosetta/ide-plugin-code';

export interface DiffRow {
  kind: 'same' | 'del' | 'ins';
  text: string;
  old: number | null;
  now: number | null;
  hunk: number | null;
}

export type DiffBlock = { kind: 'rows'; rows: DiffRow[] } | { kind: 'fold'; id: number; lines: number };

export interface DiffPair {
  left: DiffRow | null;
  right: DiffRow | null;
}

export type DiffSides = { kind: 'pairs'; pairs: DiffPair[] } | { kind: 'fold'; id: number; lines: number };

export class Diff {
  readonly path = signal<string | null>(null);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly before = signal('');
  readonly after = signal('');
  readonly deleted = signal(false);
  readonly from = signal('');
  readonly opened = signal<number[]>([]);

  private readonly context = 3;

  constructor(
    private readonly head: (path: string) => Promise<{ text: string | null }>,
    private readonly peek: (path: string) => Promise<{ text: string }>,
    private readonly steps: (a: string[], b: string[]) => Step[],
    private readonly split: (text: string) => string[],
  ) {}

  decide(was: string, now: string): { do: 'skip' } | { do: 'close' } | { do: 'show'; path: string; state: 'deleted' | 'other' } {
    if (was === '' || now === '') return { do: 'skip' };
    const [wasState, wasPath] = was.split('\u0000');
    const [state, path] = now.split('\u0000');
    if (wasPath !== path || wasState === state || path === undefined) return { do: 'skip' };
    if (state === 'clean') return { do: 'close' };
    return { do: 'show', path, state: state === 'deleted' ? 'deleted' : 'other' };
  }

  async show(path: string, state: 'deleted' | 'other' = 'other', from?: string): Promise<void> {
    batch(() => {
      this.path.value = path;
      this.open.value = true;
      this.busy.value = true;
      this.error.value = '';
      this.opened.value = [];
      this.before.value = '';
      this.after.value = '';
      this.deleted.value = state === 'deleted';
      this.from.value = '';
    });

    const [was, now] = await Promise.all([
      this.headOf(from ?? path),
      state === 'deleted' ? Promise.resolve('') : this.nowOf(path),
    ]);
    if (this.path.peek() !== path) return;
    batch(() => {
      this.before.value = was;
      this.after.value = now;
      this.busy.value = false;
    });
  }

  showShelved(path: string, before: string, after: string, from: string): void {
    batch(() => {
      this.path.value = path;
      this.open.value = true;
      this.busy.value = false;
      this.error.value = '';
      this.opened.value = [];
      this.before.value = before;
      this.after.value = after;
      this.deleted.value = false;
      this.from.value = from;
    });
  }

  failed(path: string, why: string, from: string): void {
    batch(() => {
      this.path.value = path;
      this.open.value = true;
      this.busy.value = false;
      this.error.value = why;
      this.before.value = '';
      this.after.value = '';
      this.from.value = from;
    });
  }

  close(): void {
    batch(() => {
      this.open.value = false;
      this.path.value = null;
      this.busy.value = false;
      this.from.value = '';
    });
  }

  toggleFold(id: number): void {
    const list = this.opened.value;
    this.opened.value = list.includes(id) ? list.filter((one) => one !== id) : [...list, id];
  }

  rows(): DiffRow[] {
    const a = this.split(this.before.value);
    const b = this.split(this.after.value);
    const out: DiffRow[] = [];
    let ai = 0;
    let bi = 0;
    let hunk = -1;
    let inHunk = false;
    for (const step of this.steps(a, b)) {
      for (let i = 0; i < step.count; i += 1) {
        if (step.kind === 'same') {
          inHunk = false;
          out.push({ kind: 'same', text: b[bi] ?? '', old: ai + 1, now: bi + 1, hunk: null });
          ai += 1;
          bi += 1;
          continue;
        }
        if (!inHunk) {
          inHunk = true;
          hunk += 1;
        }
        if (step.kind === 'del') {
          out.push({ kind: 'del', text: a[ai] ?? '', old: ai + 1, now: null, hunk });
          ai += 1;
          continue;
        }
        out.push({ kind: 'ins', text: b[bi] ?? '', old: null, now: bi + 1, hunk });
        bi += 1;
      }
    }
    return out;
  }

  revertedText(hunk: number): string | null {
    const rows = this.rows();
    if (!rows.some((row) => row.hunk === hunk)) return null;
    const out: string[] = [];
    for (const row of rows) {
      const mine = row.hunk === hunk;
      if (row.kind === 'same') out.push(row.text);
      else if (row.kind === 'ins' && !mine) out.push(row.text);
      else if (row.kind === 'del' && mine) out.push(row.text);
    }
    const tail = this.after.value.endsWith('\n') ? '\n' : '';
    return out.length === 0 ? '' : out.join('\n') + tail;
  }

  blocks(): DiffBlock[] {
    const rows = this.rows();
    const out: DiffBlock[] = [];
    const opened = this.opened.value;
    let folds = 0;
    let at = 0;

    const push = (chunk: DiffRow[]) => {
      if (chunk.length === 0) return;
      const last = out[out.length - 1];
      if (last?.kind === 'rows') last.rows.push(...chunk);
      else out.push({ kind: 'rows', rows: chunk });
    };

    while (at < rows.length) {
      if (rows[at]!.kind !== 'same') {
        push([rows[at]!]);
        at += 1;
        continue;
      }
      let end = at;
      while (end < rows.length && rows[end]!.kind === 'same') end += 1;
      const run = rows.slice(at, end);
      const lead = at === 0 ? 0 : this.context;
      const tail = end === rows.length ? 0 : this.context;
      const hidden = run.length - lead - tail;
      if (hidden <= 1) {
        push(run);
      } else {
        const id = folds;
        folds += 1;
        push(run.slice(0, lead));
        if (opened.includes(id)) push(run.slice(lead, run.length - tail));
        else out.push({ kind: 'fold', id, lines: hidden });
        push(tail === 0 ? [] : run.slice(run.length - tail));
      }
      at = end;
    }
    return out;
  }

  sides(): DiffSides[] {
    return this.blocks().map((block) =>
      block.kind === 'fold' ? block : { kind: 'pairs' as const, pairs: this.pairRows(block.rows) },
    );
  }

  private pairRows(rows: DiffRow[]): DiffPair[] {
    const out: DiffPair[] = [];
    let at = 0;
    while (at < rows.length) {
      const row = rows[at]!;
      if (row.kind === 'same') {
        out.push({ left: row, right: row });
        at += 1;
        continue;
      }
      const gone: DiffRow[] = [];
      const born: DiffRow[] = [];
      while (at < rows.length && rows[at]!.kind !== 'same') {
        if (rows[at]!.kind === 'del') gone.push(rows[at]!);
        else born.push(rows[at]!);
        at += 1;
      }
      for (let i = 0; i < Math.max(gone.length, born.length); i += 1) {
        out.push({ left: gone[i] ?? null, right: born[i] ?? null });
      }
    }
    return out;
  }

  count(): { added: number; removed: number } {
    let added = 0;
    let removed = 0;
    for (const row of this.rows()) {
      if (row.kind === 'ins') added += 1;
      if (row.kind === 'del') removed += 1;
    }
    return { added, removed };
  }

  private async headOf(path: string): Promise<string> {
    try {
      return (await this.head(path)).text ?? '';
    } catch {
      return '';
    }
  }

  private async nowOf(path: string): Promise<string> {
    try {
      return (await this.peek(path)).text;
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (this.path.peek() === path) this.error.value = text;
      return '';
    }
  }
}
