export class Anchors {
  of(text: string): string {
    return text.trim();
  }

  find(read: (line: number) => string, total: number, anchor: string, near: number): number {
    const home = Math.min(Math.max(1, near), Math.max(1, total));
    if (anchor === '' || total === 0) return home;
    if (this.of(read(home)) === anchor) return home;
    for (let step = 1; step < total; step += 1) {
      const up = home - step;
      if (up >= 1 && this.of(read(up)) === anchor) return up;
      const down = home + step;
      if (down <= total && this.of(read(down)) === anchor) return down;
      if (up < 1 && down > total) break;
    }
    return home;
  }
}

export const anchors = new Anchors();
