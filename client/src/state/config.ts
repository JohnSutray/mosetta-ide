import { signal } from '@preact/signals';
import type { ConfigBundle, EditorSettings, Keymap, Settings } from '@ide/protocol';
import { DEFAULT_SETTINGS_FALLBACK } from './fallback.js';

export const settings = signal<Settings | null>(null);
export const keymap = signal<Keymap>({ version: 1, bindings: [] });
export const configSources = signal<string[]>([]);

export function editorSettings(): EditorSettings {
  return settings.value?.editor ?? DEFAULT_SETTINGS_FALLBACK.editor;
}

export function applyConfig(bundle: ConfigBundle): void {
  settings.value = bundle.settings;
  keymap.value = bundle.keymap;
  configSources.value = bundle.sources;
}
