import { signal } from '@preact/signals';

export class EditorFocus {
  readonly wanted = signal(0);

  private onMount = true;

  openWithoutFocus(): void {
    this.onMount = false;
  }

  takeOnMount(): boolean {
    const wanted = this.onMount;
    this.onMount = true;
    return wanted;
  }

  focus(): void {
    this.wanted.value += 1;
  }
}

export const editorFocus = new EditorFocus();
