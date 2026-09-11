import { signal } from '@preact/signals';
import type { ConfigBundle, Keymap, Settings } from '@mosetta/ide-protocol';

export class Config {
  readonly settings = signal<Settings | null>(null);
  readonly keymap = signal<Keymap>({ version: 1, bindings: [] });
  readonly sources = signal<string[]>([]);
  readonly user = signal<Record<string, Record<string, unknown>>>({});
  readonly defaults = signal<Settings | null>(null);

  apply(bundle: ConfigBundle): void {
    this.settings.value = bundle.settings;
    this.keymap.value = bundle.keymap;
    this.sources.value = bundle.sources;
    this.user.value = bundle.user ?? {};
    this.defaults.value = bundle.defaults ?? null;
  }
}
