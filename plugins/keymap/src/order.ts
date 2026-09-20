import type { KeyBinding, KeyContext } from './types.js';

/**
 * The order of the rows in the layout editor.
 *
 * In the file the rows lie as they were written — by the sense of the task ("everything
 * about search together"). On screen that reads badly: one and the same chord occurs in
 * three surfaces, and working out which row will fire HERE is only possible by reading
 * off the context column.
 *
 * So the list is grouped by SURFACE: the global ones first (they work everywhere and
 * are therefore the most important), then the surfaces in the order they are read in.
 * Within a group the shipping order is left alone — it is meaningful.
 *
 * Pure logic, hence a class and a test.
 */
export class KeymapOrder {
  /**
   * The surfaces as a list — the same union as in the types. `global` first: it is not
   * a surface but the absence of one, and such keys are older than all.
   */
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
    'debug-edit',
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

  /** The surfaces offered in the edit box: without `global`. */
  get pickable(): KeyContext[] {
    return this.contexts.filter((one) => one !== 'global');
  }

  /**
   * A surface's place. An unfamiliar one goes to the end, but not silently: it is
   * visible there.
   */
  rank(when?: KeyContext): number {
    const at = this.contexts.indexOf(when ?? 'global');
    return at === -1 ? this.contexts.length : at;
  }

  /**
   * The sort is stable: the order within a surface is the one from the shipment. `sort`
   * is stable in V8, but relying on that in a rule the look of the screen depends on is
   * not worth it — we carry the index explicitly.
   */
  sort(bindings: readonly KeyBinding[]): KeyBinding[] {
    return bindings
      .map((binding, at) => ({ binding, at }))
      .sort((a, b) => this.rank(a.binding.when) - this.rank(b.binding.when) || a.at - b.at)
      .map((one) => one.binding);
  }
}

/** One per plugin: there is no state, and the rule is one. */
export const keymapOrder = new KeymapOrder();
