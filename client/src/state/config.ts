import { signal } from '@preact/signals';
import type { ConfigBundle, Keymap, Settings } from '@ide/protocol';

export const settings = signal<Settings | null>(null);
export const keymap = signal<Keymap>({ version: 1, bindings: [] });
export const configSources = signal<string[]>([]);

export function applyConfig(bundle: ConfigBundle): void {
  settings.value = bundle.settings;
  keymap.value = bundle.keymap;
  configSources.value = bundle.sources;
}
