import { batch, signal } from '@preact/signals';
import type { Step } from '@mosetta/ide-plugin-code';

/** A diff row: where it comes from and what its numbers are on either side. */
export interface DiffRow {
  kind: 'same' | 'del' | 'ins';
  text: string;
  /** The row's number in the commit. `null` means the row was not there. */
  old: number | null;
  /** The row's number now. `null` means the row has been taken away. */
  now: number | null;
  /**
   * The number of the HUNK — a consecutive batch of unlike rows. `null` on common rows:
   * there is nothing to revert in them.
   */
  hunk: number | null;
}

/**
 * What to show: a batch of rows, or a folded middle.
 *
 * What is folded NAMES how many rows it has hidden, and unfolds on a click: a "…" with
 * no number is indistinguishable from "there is nothing here".
 */
export type DiffBlock = { kind: 'rows'; rows: DiffRow[] } | { kind: 'fold'; id: number; lines: number };

/**
 * A row in two columns: what was on the left, what became on the right. `null` means
 * this side is not there.
 */
export interface DiffPair {
  left: DiffRow | null;
  right: DiffRow | null;
}

/**
 * The same as `DiffBlock`, but with the rows brought into pairs — for showing in two
 * columns.
 */
export type DiffSides = { kind: 'pairs'; pairs: DiffPair[] } | { kind: 'fold'; id: number; lines: number };

/**
 * One file's diff: what was in the commit against what there is now.
 *
 * Both sides are taken from NEIGHBOURS: "how it was" is known by the git plugin (it
 * carries that to the editor anyway, for the strips), "how it is now" by the memory
 * layer through the document plugin. The panel has no reading of files of its own and
 * never will: a third source of text would part company with the first two on the very
 * first day.
 *
 * The parsing itself belongs to somebody else: `steps` from the code display plugin,
 * the same Myers that computes the strips beside the rows and the three-way merge. A
 * second diff in the project would mean that the strip on the left and the diff in the
 * panel would one day disagree about what has changed.
 */
export class Diff {
  /** Whose diff we are showing. `null` means nobody's. */
  readonly path = signal<string | null>(null);
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  /** The text from the commit. Empty for a new file — it was not there. */
  readonly before = signal('');
  /** The text now. Empty for a deleted one — it is no longer there. */
  readonly after = signal('');
  /**
   * The file has been deleted: an empty right-hand side is an answer rather than
   * silence.
   */
  readonly deleted = signal(false);
  /**
   * Where the edit comes from: empty means the working tree, otherwise the name of a
   * shelf entry. The heading is obliged to say so, or what is put aside and what is
   * current look alike.
   */
  readonly from = signal('');
  /** Which folds the user has opened. Reset along with the file. */
  readonly opened = signal<number[]>([]);

  /** How many rows we leave around an edit when we fold the middle. */
  private readonly context = 3;

  constructor(
    /** What the file was in the commit. `null` means it was not in the commit. */
    private readonly head: (path: string) => Promise<{ text: string | null }>,
    /**
     * What the file has become: the memory rather than the disk — it knows about the
     * unsaved too.
     */
    private readonly peek: (path: string) => Promise<{ text: string }>,
    /** Somebody else's row-by-row diff: one of our own would breed two opinions. */
    private readonly steps: (a: string[], b: string[]) => Step[],
    /** Breaking text into lines — the same as the diff's: an empty file is ZERO lines. */
    private readonly split: (text: string) => string[],
  ) {}

  /**
   * The snapshot has changed — what to do with what is on show.
   *
   * The decision is computed FROM TWO KEYS ("state\0path", before and after) and
   * touches neither the DOM nor the signals — which is why the rule has a test rather
   * than a comment. The key is a string: the git snapshot is reassembled every few
   * seconds, and an effect depending on an object would tug at the reading of the file
   * for nothing.
   */
  decide(was: string, now: string): { do: 'skip' } | { do: 'close' } | { do: 'show'; path: string; state: 'deleted' | 'other' } {
    if (was === '' || now === '') return { do: 'skip' };
    const [wasState, wasPath] = was.split('\u0000');
    const [state, path] = now.split('\u0000');
    if (wasPath !== path || wasState === state || path === undefined) return { do: 'skip' };
    if (state === 'clean') return { do: 'close' };
    return { do: 'show', path, state: state === 'deleted' ? 'deleted' : 'other' };
  }

  /**
   * Show a file's diff.
   *
   * A late answer does NOT rearrange what is on show: the user has managed to click on
   * the next row, and what they must see is that row rather than the one that answered
   * first.
   */
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

  /**
   * Show what is PUT ASIDE.
   *
   * The texts arrive ready-made: they were assembled by the one who can read a patch.
   * Everything else is the same — the folds, the two columns, the highlighting: the
   * user is looking at their own edit, and where it lies is no business of the view's.
   */
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

  /** Say out loud that showing it did not work out: an empty diff would be a deception. */
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

  /** Unfold a folded middle. Folding it back is the same click. */
  toggleFold(id: number): void {
    const list = this.opened.value;
    this.opened.value = list.includes(id) ? list.filter((one) => one !== id) : [...list, id];
  }

  /** The diff's rows one after another, with no folds: `blocks` counts those. */
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

  /**
   * What the file will become if ONE hunk is reverted.
   *
   * We assemble the working tree's text afresh out of the rows on show: the common ones
   * as they are, the added ones except this hunk's, the removed ones only within it. It
   * is computed by a PURE function, with no DOM and no signals, so the rule has a test
   * rather than a comment.
   *
   * The trailing line break is put back by hand: `split` eats it on purpose (an empty
   * file is zero lines rather than one empty one), and without this a revert would
   * quietly take a file's last line break away — exactly the trouble that turned up in
   * the git strips the same day.
   */
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

  /**
   * The same, but with the runs of unchanged rows folded into one row.
   *
   * We fold only where there is something to hide: a run shorter than the fold plus its
   * caption saves nothing while getting in the way of reading.
   */
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

  /**
   * The same thing in TWO COLUMNS.
   *
   * An edit is a "before → after" pair, and in two columns it is read the way WebStorm
   * does it: what was taken away on the left, what was added on the right, at the same
   * height. Where the sides are of different lengths the shorter one is left with empty
   * space — otherwise the rows would travel relative to one another, and the pair would
   * stop reading as a pair.
   */
  sides(): DiffSides[] {
    return this.blocks().map((block) =>
      block.kind === 'fold' ? block : { kind: 'pairs' as const, pairs: this.pairRows(block.rows) },
    );
  }

  /**
   * Bring the rows into pairs. We take the edited stretch WHOLE, up to the nearest
   * unchanged row: inside it what was removed and what was added stand opposite each
   * other, in whatever order Myers handed them over.
   */
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

  /** How many rows have been added and removed: the heading answers that at once. */
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

  /**
   * There may be no text for two different reasons, and neither may be passed over in
   * silence: the file has been deleted (then empty is the truth) or it is not in memory
   * (then empty is a deception). About the second we speak with an error.
   */
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
