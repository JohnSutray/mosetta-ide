import { signal } from '@preact/signals';

let focusOnMount = true;

export function openWithoutFocus(): void {
  focusOnMount = false;
}

export function takeFocusOnMount(): boolean {
  const wanted = focusOnMount;
  focusOnMount = true;
  return wanted;
}

export const wantsFocus = signal(0);

export function focusEditor(): void {
  wantsFocus.value += 1;
}
