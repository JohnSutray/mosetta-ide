import type { KeyBinding, KeyContext } from './types.js';

export class KeymapOrder {
  readonly contexts: KeyContext[] = [
    'global',
    'editor',
    'tree',
    'search',
    'projects',
    'pick',
    'prompt',
    'menu',
    'terminal',
    'merge',
    'settings',
    'find',
    'find-multiline',
    'find-replace',
    'find-files',
    'find-files-mask',
    'completion',
    'branch-name',
    'push',
    'keys',
    'keymap-edit',
    'editable',
  ];

  get pickable(): KeyContext[] {
    return this.contexts.filter((one) => one !== 'global');
  }

  rank(when?: KeyContext): number {
    const at = this.contexts.indexOf(when ?? 'global');
    return at === -1 ? this.contexts.length : at;
  }

  sort(bindings: readonly KeyBinding[]): KeyBinding[] {
    return bindings
      .map((binding, at) => ({ binding, at }))
      .sort((a, b) => this.rank(a.binding.when) - this.rank(b.binding.when) || a.at - b.at)
      .map((one) => one.binding);
  }
}

export const keymapOrder = new KeymapOrder();
