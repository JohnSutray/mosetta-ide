
export type HunkKind = 'added' | 'modified' | 'removed';

export interface Hunk {
  kind: HunkKind;
  from: number;
  to: number;
  before: string[];
}

const MAX_EDITS = 1000;

export function diffLines(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const a = splitLines(before);
  const b = splitLines(after);
  return toHunks(diffSteps(a, b), a);
}

export interface Step {
  kind: 'same' | 'del' | 'ins';
  count: number;
}

export function diffSteps(a: string[], b: string[]): Step[] {
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
  for (const step of diffMiddle(a.slice(head, a.length - tail), b.slice(head, b.length - tail))) {
    add(steps, step);
  }
  if (tail > 0) add(steps, { kind: 'same', count: tail });
  return steps;
}

function add(steps: Step[], step: Step): void {
  const last = steps[steps.length - 1];
  if (last && last.kind === step.kind) last.count += step.count;
  else steps.push({ ...step });
}

function diffMiddle(a: string[], b: string[]): Step[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ kind: 'ins', count: b.length }];
  if (b.length === 0) return [{ kind: 'del', count: a.length }];
  const script = myers(a, b);
  if (script) return script;
  return [
    { kind: 'del', count: a.length },
    { kind: 'ins', count: b.length },
  ];
}

function myers(a: string[], b: string[]): Step[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, MAX_EDITS);
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
      if (x >= n && y >= m) return walkBack(trace, a, b, d, offset, size);
    }
    v = v.slice();
  }
  return null;
}

function walkBack(
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
      push(steps, 'same');
      x -= 1;
      y -= 1;
    }
    if (down) {
      push(steps, 'ins');
      y -= 1;
    } else {
      push(steps, 'del');
      x -= 1;
    }
  }
  while (x > 0 && y > 0) {
    push(steps, 'same');
    x -= 1;
    y -= 1;
  }
  return steps.reverse().map((step) => step);
}

function push(steps: Step[], kind: Step['kind']): void {
  const last = steps[steps.length - 1];
  if (last && last.kind === kind) last.count += 1;
  else steps.push({ kind, count: 1 });
}

function toHunks(steps: Step[], before: string[]): Hunk[] {
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

export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
