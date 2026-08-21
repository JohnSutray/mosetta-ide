import { signal } from '@preact/signals';

export interface PickApi {
  next(): void;
  prev(): void;
  accept(): void;
  expand?(): void;
}

export const activePick = signal<PickApi | null>(null);
