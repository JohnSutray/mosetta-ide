

export interface PickApi {
  next(): void;
  prev(): void;
  accept(): void;
  expand?(): void;
}
