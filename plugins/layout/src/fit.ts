export interface ColumnAsk {
  id: string;
  width: number;
  min: number;
}

export class ColumnFit {
  constructor(
    private readonly keepFree: number,
    private readonly grip = 1,
  ) {}

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
