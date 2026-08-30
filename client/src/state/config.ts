import { signal } from '@preact/signals';
import type { ConfigBundle, EditorSettings, Keymap, Settings } from '@ide/protocol';
import { DEFAULT_SETTINGS_FALLBACK } from './fallback.js';

export class Config {
  readonly settings = signal<Settings | null>(null);
  readonly keymap = signal<Keymap>({ version: 1, bindings: [] });
  readonly sources = signal<string[]>([]);

  editor(): EditorSettings {
    return this.settings.value?.editor ?? DEFAULT_SETTINGS_FALLBACK.editor;
  }

  followEditor(): boolean {
    return this.settings.value?.tree.followEditor ?? DEFAULT_SETTINGS_FALLBACK.tree.followEditor;
  }

  apply(bundle: ConfigBundle): void {
    this.settings.value = bundle.settings;
    this.keymap.value = bundle.keymap;
    this.sources.value = bundle.sources;
  }
}

export const config = new Config();
