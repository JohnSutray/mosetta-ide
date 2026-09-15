import { computed, signal, type ReadonlySignal } from '@preact/signals';

export interface ChipsWire {
  all: ReadonlySignal<string[]>;
  off: ReadonlySignal<string[]>;
  saveAll(list: string[]): Promise<void>;
  saveOff(list: string[]): Promise<void>;
}

export class MaskChips {
  readonly draft = signal('');

  constructor(
    private readonly wire: ChipsWire,
    private readonly complain: (message: string) => void,
    private readonly rerun: () => void,
  ) {}

  get all(): ReadonlySignal<string[]> {
    return this.wire.all;
  }

  readonly active: ReadonlySignal<string[]> = computed(() => {
    const off = new Set(this.wire.off.value);
    return this.wire.all.value.filter((one) => !off.has(one));
  });

  isOff(mask: string): boolean {
    return this.wire.off.value.includes(mask);
  }

  toggle(mask: string): void {
    const off = this.wire.off.value;
    const next = off.includes(mask) ? off.filter((one) => one !== mask) : [...off, mask];
    this.after(this.wire.saveOff(next));
  }

  add(): void {
    const mask = this.draft.value.trim();
    this.draft.value = '';
    if (mask === '' || this.wire.all.value.includes(mask)) return;
    this.after(this.wire.saveAll([...this.wire.all.value, mask]));
  }

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
