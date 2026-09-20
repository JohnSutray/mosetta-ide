import { batch, signal } from '@preact/signals';

export interface Ask {
  id: number;
  title: string;
  text?: string;
  field: boolean;
  value?: string;
  filename?: boolean;
  confirm: string;
  danger?: boolean;
  error?: string;
  run: (value: string) => Promise<void>;
  onCancel?: () => void;
}

export class Asking {
  readonly ask = signal<Ask | null>(null);

  readonly draft = signal('');

  private nextId = 1;

  show(spec: Omit<Ask, 'id'>): void {
    const displaced = this.ask.peek();
    batch(() => {
      this.draft.value = spec.value ?? '';
      this.ask.value = { ...spec, id: this.nextId++ };
    });
    displaced?.onCancel?.();
  }

  cancel(): void {
    const asked = this.ask.value;
    this.ask.value = null;
    asked?.onCancel?.();
  }

  async answer(): Promise<void> {
    const asked = this.ask.value;
    if (!asked) return;
    const answer = this.draft.value.trim();
    if (asked.field && answer === '') return;
    try {
      await asked.run(answer);
      this.ask.value = null;
    } catch (err) {
      this.ask.value = { ...asked, error: describe(err) };
    }
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
