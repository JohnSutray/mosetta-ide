/**
 * A breakpoint remembers a PLACE rather than a NUMBER.
 *
 * The rule: "not 'I am standing on line five' but 'I am standing on `return
 * value`'". A number is an address that anyone changes: `git pull`, a formatter, a
 * neighbour on the branch. The line's text is what the user pointed a finger at, and
 * it survives a shift.
 *
 * While the file is open the breakpoint is carried by CodeMirror itself: it travels
 * with the edits, because it lives as a POSITION. The anchor is needed where positions
 * are lost: the text was replaced whole (re-read from disk, somebody else's edit pulled
 * in), the file was opened again, the tab was reloaded.
 *
 * A class of its own, and with a test, because the whole rule is in the choice of line:
 * which of the identical ones to take, and what to do when none is found.
 */
export class Anchors {
  /**
   * What we remember the place with: the line's text without the indentation.
   *
   * Without the indentation because a formatter changes indentation while the meaning
   * of the line does not; and `return value;` that has moved into another block is
   * still that same line.
   */
  of(text: string): string {
    return text.trim();
  }

  /**
   * Where that line is now.
   *
   * `read` hands over a line's text (from one), `total` how many there are, `near`
   * where the breakpoint used to stand.
   *
   * There are three rules, and all three are about honesty:
   *
   * 1. in its own place — that is where we leave it (the commonest case, and it costs
   * nothing);
   *
   * 2. the text has moved — we take the NEAREST match, because the line `}` occurs a
   * hundred times and "the first from the top" would carry the breakpoint off to the
   * beginning of the file; at equal distance we take the upper one, simply so that
   * there is one rule rather than "as luck has it";
   *
   * 3. none found at all — we leave the number as it was. Throwing the breakpoint away
   * silently is not allowed (the user set it by hand), and lying about a new place
   * even less so: let it stand where it stood, and that is visible to the eye.
   *
   * An empty anchor is not searched for at all: an empty line matches any empty line,
   * and a search for "the nearest empty one" is a lottery rather than a memory.
   */
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
