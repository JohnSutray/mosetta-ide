/**
 * A line-by-line diff: what changed between what is in the last commit and what a human
 * has typed right now.
 *
 * Computed on the client rather than on the server, and that is the main decision here:
 * the strips at the side have to move with the caret rather than lag by one save.
 * Sending the text to the server on every keystroke for this is a bad bargain, and `git
 * diff` knows nothing about unsaved work anyway.
 */

export type HunkKind = 'added' | 'modified' | 'removed';

export interface Hunk {
  kind: HunkKind;
  /**
   * The first line in the CURRENT text, one-based. For a removal, the line AFTER the
   * hole.
   */
  from: number;
  /** The last line in the current text, one-based. For a removal, equal to `from`. */
  to: number;
  /** What used to be here. Empty for an addition. */
  before: string[];
}

/** A step of the walk: how many lines were eaten on each side. */
export interface Step {
  kind: 'same' | 'del' | 'ins';
  count: number;
}

/**
 * The line-by-line diff.
 *
 * A class rather than a bundle of functions: the complexity ceiling is its field, and
 * one day its methods will carry measurements. Myers on a large file is the first thing
 * one will want to measure when told "the editor feels sluggish".
 */
export class LineDiff {
  /**
   * The complexity ceiling. Myers finds a path of length D in O(N·D); on a sensible
   * edit D is in the tens. If there are more than a thousand differences, the file was
   * rewritten whole, and nobody will read a detailed breakdown anyway: it is more
   * honest to say "this middle is different" than to spend a minute counting.
   */
  private readonly maxEdits = 1000;

  hunks(before: string, after: string): Hunk[] {
    if (before === after) return [];
    const a = this.split(before);
    const b = this.split(after);
    return this.toHunks(this.steps(a, b), a);
  }

  /**
   * The whole script for turning `a` into `b`, from the first line to the last.
   *
   * It is exposed not for the strips' sake: the strips make do with hunks. It is asked
   * for by three-way merging — there one needs to know WHICH lines of the common
   * ancestor each side left untouched, and hunks no longer remember that. One Myers for
   * two jobs: a second one would have drifted from the first on the first day.
   */
  steps(a: string[], b: string[]): Step[] {
    let head = 0;
    while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
    let tail = 0;
    while (
      tail < a.length - head &&
      tail < b.length - head &&
      a[a.length - 1 - tail] === b[b.length - 1 - tail]
    ) {
      tail += 1;
    }

    const steps: Step[] = [];
    if (head > 0) steps.push({ kind: 'same', count: head });
    for (const step of this.diffMiddle(a.slice(head, a.length - tail), b.slice(head, b.length - tail))) {
      this.add(steps, step);
    }
    if (tail > 0) this.add(steps, { kind: 'same', count: tail });
    return steps;
  }

  /** Neighbouring steps of one kind are one step. */
  private add(steps: Step[], step: Step): void {
    const last = steps[steps.length - 1];
    if (last && last.kind === step.kind) last.count += step.count;
    else steps.push({ ...step });
  }

  private diffMiddle(a: string[], b: string[]): Step[] {
    if (a.length === 0 && b.length === 0) return [];
    if (a.length === 0) return [{ kind: 'ins', count: b.length }];
    if (b.length === 0) return [{ kind: 'del', count: a.length }];
    const script = this.myers(a, b);
    if (script) return script;
    return [
      { kind: 'del', count: a.length },
      { kind: 'ins', count: b.length },
    ];
  }

  /**
   * Myers, the greedy variant with a trace. Returns `null` if there are more
   * differences than the ceiling.
   */
  private myers(a: string[], b: string[]): Step[] | null {
    const n = a.length;
    const m = b.length;
    const max = Math.min(n + m, this.maxEdits);
    const offset = max;
    const size = 2 * max + 1;
    let v = new Int32Array(size);
    const trace: Int32Array[] = [];

    for (let d = 0; d <= max; d += 1) {
      trace.push(v.slice());
      for (let k = -d; k <= d; k += 2) {
        const at = k + offset;
        if (at < 0 || at >= size) continue;
        let x: number;
        if (k === -d || (k !== d && (v[at - 1] ?? -1) < (v[at + 1] ?? -1))) {
          x = v[at + 1] ?? 0;
        } else {
          x = (v[at - 1] ?? 0) + 1;
        }
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) {
          x += 1;
          y += 1;
        }
        v[at] = x;
        if (x >= n && y >= m) return this.walkBack(trace, a, b, d, offset, size);
      }
      v = v.slice();
    }
    return null;
  }

  /** We walk the trace backwards and stack the steps in forward order. */
  private walkBack(
    trace: Int32Array[],
    a: string[],
    b: string[],
    d: number,
    offset: number,
    size: number,
  ): Step[] {
    const steps: Step[] = [];
    let x = a.length;
    let y = b.length;

    for (let depth = d; depth > 0; depth -= 1) {
      const v = trace[depth]!;
      const k = x - y;
      const at = k + offset;
      const down = k === -depth || (k !== depth && (v[at - 1] ?? -1) < (v[at + 1] ?? -1));
      const prevK = down ? k + 1 : k - 1;
      const prevAt = prevK + offset;
      const prevX = prevAt >= 0 && prevAt < size ? (v[prevAt] ?? 0) : 0;
      const prevY = prevX - prevK;

      while (x > prevX && y > prevY) {
        this.push(steps, 'same');
        x -= 1;
        y -= 1;
      }
      if (down) {
        this.push(steps, 'ins');
        y -= 1;
      } else {
        this.push(steps, 'del');
        x -= 1;
      }
    }
    while (x > 0 && y > 0) {
      this.push(steps, 'same');
      x -= 1;
      y -= 1;
    }
    return steps.reverse().map((step) => step);
  }

  private push(steps: Step[], kind: Step['kind']): void {
    const last = steps[steps.length - 1];
    if (last && last.kind === kind) last.count += 1;
    else steps.push({ kind, count: 1 });
  }

  /**
   * Steps to hunks. A deletion immediately followed by an insertion is a REPLACEMENT:
   * the user was editing a line rather than throwing one away and writing another, and
   * there should be one strip.
   */
  private toHunks(steps: Step[], before: string[]): Hunk[] {
    const hunks: Hunk[] = [];
    let oldAt = 0;
    let newAt = 0;

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i]!;
      if (step.kind === 'same') {
        oldAt += step.count;
        newAt += step.count;
        continue;
      }
      if (step.kind === 'ins') {
        hunks.push({
          kind: 'added',
          from: newAt + 1,
          to: newAt + step.count,
          before: [],
        });
        newAt += step.count;
        continue;
      }
      const next = steps[i + 1];
      const removed = before.slice(oldAt, oldAt + step.count);
      if (next?.kind === 'ins') {
        hunks.push({
          kind: 'modified',
          from: newAt + 1,
          to: newAt + next.count,
          before: removed,
        });
        oldAt += step.count;
        newAt += next.count;
        i += 1;
        continue;
      }
      const anchor = newAt + 1;
      hunks.push({ kind: 'removed', from: anchor, to: anchor, before: removed });
      oldAt += step.count;
    }

    return hunks;
  }

  /**
   * A trailing newline is not an empty line. Otherwise a file ending in a newline —
   * that is, almost any file — would get an extra line in the diff.
   */
  split(text: string): string[] {
    if (text === '') return [];
    const lines = text.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /**
   * What the text becomes if this hunk is reverted.
   *
   * A pure function over a STRING rather than a transaction over a live editor.
   * Reverting used to be something only an `EditorView` could do, and because of that
   * one button the core held a reference to the editor — that is, to CodeMirror. The
   * rule is the same as with `goTo`: one asks not "give me the editor" but "do this".
   */
  reverted(text: string, hunk: Hunk): string {
    const lines = this.split(text);
    const restored = hunk.before;

    if (hunk.kind === 'added') {
      const from = Math.min(hunk.from, lines.length + 1) - 1;
      const to = Math.min(hunk.to, lines.length);
      return [...lines.slice(0, from), ...lines.slice(to)].join('\n');
    }

    if (hunk.kind === 'modified') {
      const from = Math.min(hunk.from, lines.length) - 1;
      const to = Math.min(hunk.to, lines.length);
      return [...lines.slice(0, from), ...restored, ...lines.slice(to)].join('\n');
    }

    const at = Math.min(hunk.from, lines.length + 1) - 1;
    return [...lines.slice(0, at), ...restored, ...lines.slice(at)].join('\n');
  }
}
