/** A side column as it asks to be: the remembered width, and what it may not go below. */
export interface ColumnAsk {
  id: string;
  width: number;
  min: number;
}

/**
 * Squeezing the side columns for the middle's sake.
 *
 * The symptom: a terminal at 460, debug at 340 and problems at 360 on a 1440-pixel
 * screen — and the editor gets nothing. Each column honestly took its own width, and
 * nobody checked the remainder: the free-space rule guarded only the dragging of ONE
 * column rather than the sum.
 *
 * The rule: the middle always keeps its free space. If that does not fit, the side
 * columns are squeezed PROPORTIONALLY to their slack (what each has between its
 * remembered width and its minimum) rather than "the last one opened suffers": whoever
 * asked for more gives up more. The remembered width is NOT TOUCHED in the process —
 * close a neighbour and the column returns to what was asked for. We do not squeeze
 * below the minimums: the middle then gets less than promised, and that is more honest
 * than a panel whose contents cannot be seen.
 *
 * Pure arithmetic without the DOM — and therefore with a test.
 */
export class ColumnFit {
  constructor(
    /** How much the middle is always entitled to. */
    private readonly keepFree: number,
    /** How much the strip between columns eats (5 px with −2 margins). */
    private readonly grip = 1,
  ) {}

  /**
   * The widths to show, by id. Whatever is not squeezed is as asked for.
   *
   * `keep` is the column being dragged (or dragged last): it gets exactly what it asks
   * for, and the NEIGHBOURS give way. Without that, dragging would not be one to one:
   * the squeeze would divide its own slack too, and the strip would travel at half the
   * speed of the mouse. The request is still bounded by the neighbours' minimums —
   * nobody is squeezed below those.
   */
  fit(total: number, columns: ColumnAsk[], keep?: string): Record<string, number> {
    const room = this.room(total, columns.length);
    const kept = columns.find((column) => column.id === keep);
    if (!kept) return this.squeeze(room, columns);
    const others = columns.filter((column) => column.id !== keep);
    const floor = others.reduce((sum, column) => sum + column.min, 0);
    const width = Math.max(kept.min, Math.min(kept.width, room - floor));
    return { ...this.squeeze(room - width, others), [kept.id]: width };
  }

  private squeeze(room: number, columns: ColumnAsk[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const column of columns) out[column.id] = column.width;
    const overflow = this.asked(columns) - room;
    if (overflow <= 0) return out;

    const slack = columns.reduce((sum, column) => sum + Math.max(0, column.width - column.min), 0);
    if (slack <= 0) return out;
    const share = Math.min(1, overflow / slack);
    let given = 0;
    columns.forEach((column, index) => {
      const spare = Math.max(0, column.width - column.min);
      const take = index === columns.length - 1 && share < 1
        ? Math.min(spare, overflow - given)
        : Math.round(spare * share);
      given += take;
      out[column.id] = column.width - take;
    });
    return out;
  }

  /**
   * The ceiling for dragging ONE column with live neighbours: everything left after the
   * middle and the others' MINIMUMS — rather than after the middle alone. Computing it
   * from the neighbours' shown widths will not do: a squeezed column could then not
   * grow by a single pixel, and the strip would be dead. Drag wider and the neighbours
   * give way, proportionally to their slack.
   */
  maxFor(total: number, id: string, columns: ColumnAsk[]): number {
    const others = columns.filter((column) => column.id !== id)
      .reduce((sum, column) => sum + column.min, 0);
    return this.room(total, columns.length) - others;
  }

  private asked(columns: ColumnAsk[]): number {
    return columns.reduce((sum, column) => sum + column.width, 0);
  }

  private room(total: number, count: number): number {
    return total - this.keepFree - count * this.grip;
  }
}
