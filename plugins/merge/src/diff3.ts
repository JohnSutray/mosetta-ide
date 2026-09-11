import type { LineDiff, Step } from '@mosetta/ide-plugin-code';

export type RegionKind =
  | 'same'
  | 'left'
  | 'right'
  | 'both'
  | 'conflict';

export interface Region {
  kind: RegionKind;
  base: string[];
  left: string[];
  right: string[];
}

export type SideChoice = 'take' | 'skip' | null;

export interface Choice {
  left: SideChoice;
  right: SideChoice;
}

interface Change {
  baseFrom: number;
  baseTo: number;
  sideFrom: number;
  sideTo: number;
}

export class Diff3 {
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

  undecided(region: Region, choice: Choice): boolean {
    if (region.kind !== 'conflict') return false;
    if (choice.left === 'take' || choice.right === 'take') return false;
    return !(choice.left === 'skip' && choice.right === 'skip');
  }

  allDecided(regions: Region[], choices: Choice[]): boolean {
    return regions.every((region, at) => !this.undecided(region, choices[at] ?? this.defaultChoice(region.kind)));
  }

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

  buildText(regions: Region[], choices: Choice[]): string {
    const lines: string[] = [];
    regions.forEach((region, at) => {
      lines.push(...this.resultOf(region, choices[at] ?? this.defaultChoice(region.kind)));
    });
    return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
  }

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
