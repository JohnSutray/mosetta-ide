import type { LineDiff, Step } from '@mosetta/ide-plugin-code';

/**
 * Three-way merging: two versions and a common ancestor into hunks.
 *
 * The algorithm is the classic one (diff3) rather than something invented: two diffs
 * from the ancestor, then their changes glued into shared hunks. Our own implementation
 * — because we already have Myers, and somebody else's library would know nothing about
 * our choice state or about aligning the columns.
 *
 * We compute it on the CLIENT, by the same argument as the git strips: the middle
 * column is reassembled on every press of an arrow, and pushing the text to the server
 * for that is a bad bargain.
 *
 * The sides are named once and for all: MINE ON THE LEFT, THEIRS ON THE RIGHT. For the
 * filesystem the editor is on the left and disk on the right; for git `ours` on the
 * left and `theirs` on the right; for the shelf the file on the left and the shelf on
 * the right. One rule for three suppliers — otherwise one would have to recall which is
 * which every time.
 */

export type RegionKind =
  /** Nobody touched it. There are no buttons. */
  | 'same'
  /** Only the left side touched it — it merges by itself, green. */
  | 'left'
  /** Only the right one touched it. */
  | 'right'
  /** Both sides did THE SAME THING. That is not an argument but an agreement. */
  | 'both'
  /** Both sides touched one place differently. Red. */
  | 'conflict';

export interface Region {
  kind: RegionKind;
  /** How it was at the common ancestor. */
  base: string[];
  left: string[];
  right: string[];
}

/** What the human said about one side of a hunk. `null` means nothing yet. */
export type SideChoice = 'take' | 'skip' | null;

export interface Choice {
  left: SideChoice;
  right: SideChoice;
}

/** One side's change relative to the ancestor: what was replaced with what. */
interface Change {
  baseFrom: number;
  baseTo: number;
  sideFrom: number;
  sideTo: number;
}

/**
 * Merging three sides.
 *
 * A class rather than a bundle of functions: it has one coherent set of notions — a
 * hunk, a choice, a result — and keeping them together is more honest than nine
 * exports. And when merging moves into a plugin, what moves is one object.
 */
export class Diff3 {
  /** The line-by-line diff is a field of the code display, lazily: it is a neighbour. */
  constructor(private readonly lines: () => LineDiff) {}

  regions(base: string, left: string, right: string): Region[] {
    return this.regionsOfLines(this.lines().split(base), this.lines().split(left), this.lines().split(right));
  }

  regionsOfLines(base: string[], left: string[], right: string[]): Region[] {
    const changesL = this.changesOf(this.lines().steps(base, left));
    const changesR = this.changesOf(this.lines().steps(base, right));

    const regions: Region[] = [];
    let bi = 0;
    let li = 0;
    let ri = 0;
    let atL = 0;
    let atR = 0;

    while (true) {
      const nextL = atL < changesL.length ? changesL[atL]!.baseFrom : Infinity;
      const nextR = atR < changesR.length ? changesR[atR]!.baseFrom : Infinity;
      const start = Math.min(nextL, nextR);

      if (start > bi) {
        const until = Math.min(start, base.length);
        if (until > bi) {
          const slice = base.slice(bi, until);
          regions.push({ kind: 'same', base: slice, left: slice, right: slice });
          li += until - bi;
          ri += until - bi;
          bi = until;
        }
      }
      if (start === Infinity) break;

      let hi = bi;
      let sizeL = 0;
      let sizeR = 0;
      let tookL = false;
      let tookR = false;
      for (let growing = true; growing; ) {
        growing = false;
        while (atL < changesL.length && changesL[atL]!.baseFrom <= hi) {
          const change = changesL[atL]!;
          hi = Math.max(hi, change.baseTo);
          sizeL += change.sideTo - change.sideFrom - (change.baseTo - change.baseFrom);
          tookL = true;
          atL += 1;
          growing = true;
        }
        while (atR < changesR.length && changesR[atR]!.baseFrom <= hi) {
          const change = changesR[atR]!;
          hi = Math.max(hi, change.baseTo);
          sizeR += change.sideTo - change.sideFrom - (change.baseTo - change.baseFrom);
          tookR = true;
          atR += 1;
          growing = true;
        }
      }

      const spanB = hi - bi;
      const sliceB = base.slice(bi, hi);
      const sliceL = left.slice(li, li + spanB + sizeL);
      const sliceR = right.slice(ri, ri + spanB + sizeR);

      let kind: RegionKind;
      if (tookL && tookR) kind = this.same(sliceL, sliceR) ? 'both' : 'conflict';
      else if (tookL) kind = 'left';
      else kind = 'right';

      regions.push({ kind, base: sliceB, left: sliceL, right: sliceR });
      bi = hi;
      li += spanB + sizeL;
      ri += spanB + sizeR;
    }

    return regions;
  }

  /**
   * The default choice: the uncontested is MERGED IN, the contested waits for the
   * human.
   *
   * That is the whole point of merging — if the green hunks had to be confirmed one by
   * one too, the tool would turn into rewriting the file by hand. Green can be
   * unselected, but that is a separate action.
   */
  defaultChoice(kind: RegionKind): Choice {
    switch (kind) {
      case 'left':
        return { left: 'take', right: null };
      case 'right':
        return { left: null, right: 'take' };
      case 'both':
        return { left: 'take', right: 'take' };
      default:
        return { left: null, right: null };
    }
  }

  defaultChoices(regions: Region[]): Choice[] {
    return regions.map((region) => this.defaultChoice(region.kind));
  }

  /**
   * A hunk the human has not spoken about yet. Contested ones only.
   *
   * Took AT LEAST ONE side — the argument is settled: silence about the other means "it
   * is not wanted", and that is exactly what the human meant by pressing one arrow.
   * Demanding the second would be polite pedantry: the first version did that, and by
   * the second conflict it was already irritating.
   *
   * There is one special case: took NEITHER. That is a decision too — "there should be
   * nothing here" — but it has to be said out loud, with both crosses: otherwise it is
   * indistinguishable from "I have not got here yet".
   */
  undecided(region: Region, choice: Choice): boolean {
    if (region.kind !== 'conflict') return false;
    if (choice.left === 'take' || choice.right === 'take') return false;
    return !(choice.left === 'skip' && choice.right === 'skip');
  }

  allDecided(regions: Region[], choices: Choice[]): boolean {
    return regions.every((region, at) => !this.undecided(region, choices[at] ?? this.defaultChoice(region.kind)));
  }

  /** The hunk's lines in the middle column — given such a choice. */
  resultOf(region: Region, choice: Choice): string[] {
    switch (region.kind) {
      case 'same':
        return region.base;
      case 'left':
        return choice.left === 'take' ? region.left : region.base;
      case 'right':
        return choice.right === 'take' ? region.right : region.base;
      case 'both':
        return choice.left === 'take' || choice.right === 'take' ? region.left : region.base;
      default: {
        const out: string[] = [];
        if (choice.left === 'take') out.push(...region.left);
        if (choice.right === 'take') out.push(...region.right);
        return out;
      }
    }
  }

  /**
   * The finished text. We put the trailing newline back: splitting removed it, and
   * without it a file that ended in a newline would change by one invisible byte every
   * time.
   */
  buildText(regions: Region[], choices: Choice[]): string {
    const lines: string[] = [];
    regions.forEach((region, at) => {
      lines.push(...this.resultOf(region, choices[at] ?? this.defaultChoice(region.kind)));
    });
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

  /**
   * Take one side whole — the developer is sure it is the more correct one.
   *
   * Not "press every arrow on that side": where the side changed nothing, its version
   * equals the ancestor, and the right answer is to remove the other's edit rather than
   * to take our own non-existent one.
   */
  takeSide(regions: Region[], side: 'left' | 'right'): Choice[] {
    const mine: SideChoice = 'take';
    const other: SideChoice = 'skip';
    return regions.map((region): Choice => {
      switch (region.kind) {
        case 'same':
          return { left: null, right: null };
        case 'left':
          return { left: side === 'left' ? mine : other, right: null };
        case 'right':
          return { left: null, right: side === 'right' ? mine : other };
        default:
          return side === 'left' ? { left: mine, right: other } : { left: other, right: mine };
      }
    });
  }

  /** The diff's steps into changes relative to the ancestor, in order. */
  private changesOf(steps: Step[]): Change[] {
    const changes: Change[] = [];
    let bi = 0;
    let si = 0;
    let open: Change | null = null;

    for (const step of steps) {
      if (step.kind === 'same') {
        if (open) {
          changes.push(open);
          open = null;
        }
        bi += step.count;
        si += step.count;
        continue;
      }
      open ??= { baseFrom: bi, baseTo: bi, sideFrom: si, sideTo: si };
      if (step.kind === 'del') {
        bi += step.count;
        open.baseTo = bi;
      } else {
        si += step.count;
        open.sideTo = si;
      }
    }
    if (open) changes.push(open);
    return changes;
  }

  private same(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((line, at) => line === b[at]);
  }
}
