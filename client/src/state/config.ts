import { signal } from '@preact/signals';
import type { ConfigBundle, Keymap, Settings } from '@ide/protocol';

export class Config {
  readonly settings = signal<Settings | null>(null);
  readonly keymap = signal<Keymap>({ version: 1, bindings: [] });
  readonly sources = signal<string[]>([]);

  apply(bundle: ConfigBundle): void {
    this.settings.value = bundle.settings;
    this.keymap.value = bundle.keymap;
    this.sources.value = bundle.sources;
  }
}
