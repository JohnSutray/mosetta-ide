import { computed, signal, type ReadonlySignal } from '@preact/signals';

/**
 * The row of filter chips above the project search.
 *
 * There are two — what to search (`masks`) and what not to search (`excludes`) — and
 * they are built alike: the list accumulates, the enabled ones take part, the cross
 * removes one for good. One class for both rows rather than a copy with different
 * names: a copy would one day drift in behaviour, and the difference would have to be
 * explained as something nobody intended.
 *
 * Both lists are a SETTING: the chips outlive not the tab but the machine. So there is
 * no state here beyond the draft — only reading a setting and writing into it.
 */
export interface ChipsWire {
  /**
   * The whole row, disabled ones included: a chip accumulates even when it is not
   * working.
   */
  all: ReadonlySignal<string[]>;
  /** Which are disabled right now: two lists rather than a list of pairs. */
  off: ReadonlySignal<string[]>;
  saveAll(list: string[]): Promise<void>;
  saveOff(list: string[]): Promise<void>;
}

export class MaskChips {
  /** What is being typed into the field next to the chips; Enter turns that into a chip. */
  readonly draft = signal('');

  constructor(
    private readonly wire: ChipsWire,
    private readonly complain: (message: string) => void,
    /** The list changed — the results are stale. */
    private readonly rerun: () => void,
  ) {}

  get all(): ReadonlySignal<string[]> {
    return this.wire.all;
  }

  /** What really filters: the enabled chips. */
  readonly active: ReadonlySignal<string[]> = computed(() => {
    const off = new Set(this.wire.off.value);
    return this.wire.all.value.filter((one) => !off.has(one));
  });

  isOff(mask: string): boolean {
    return this.wire.off.value.includes(mask);
  }

  /** A click on a chip: disable it, or enable it again. */
  toggle(mask: string): void {
    const off = this.wire.off.value;
    const next = off.includes(mask) ? off.filter((one) => one !== mask) : [...off, mask];
    this.after(this.wire.saveOff(next));
  }

  /** A chip from the draft: Enter in the field. Empty or a duplicate does nothing. */
  add(): void {
    const mask = this.draft.value.trim();
    this.draft.value = '';
    if (mask === '' || this.wire.all.value.includes(mask)) return;
    this.after(this.wire.saveAll([...this.wire.all.value, mask]));
  }

  /** The cross: the chip leaves for good — from the disabled list too. */
  remove(mask: string): void {
    const off = this.wire.off.value;
    this.after(
      this.wire
        .saveAll(this.wire.all.value.filter((one) => one !== mask))
        .then(() => (off.includes(mask) ? this.wire.saveOff(off.filter((one) => one !== mask)) : undefined)),
    );
  }

  private after(work: Promise<unknown>): void {
    void work.then(() => this.rerun()).catch((err) => this.complain(describe(err)));
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
