import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Diagnostic, FileDiagnostics, LspStatus } from './types.js';

/**
 * What the language server knows about the project.
 *
 * Diagnostics arrive as events and live in a map of path to list. Three read it from
 * here, and all three differently: the tree paints names with a wave, the problems
 * panel shows a list, the editor draws underlines in the text.
 *
 * The class has no conversation with the server of its own — the events are brought to
 * it. That is more honest: diagnostics are not "asked for", they happen.
 */
export class Lsp {
  readonly diagnostics = signal<Map<string, Diagnostic[]>>(new Map());
  readonly statuses = signal<LspStatus[]>([]);

  /**
   * Every error in the project, by file.
   *
   * Strictly alphabetically, as in the tree, and in NO way dependent on which file is
   * open: a project panel has to behave like a project rather than like a tab. Where
   * the caret is is visible from the row's highlight, and it moves nothing.
   */
  readonly problems: ReadonlySignal<FileDiagnostics[]> = computed(() => {
    const out: FileDiagnostics[] = [];
    for (const [path, list] of this.diagnostics.value) {
      if (list.length > 0) out.push({ path, diagnostics: list });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  });

  /** What was said about THIS file. Nothing means an empty list rather than `null`. */
  of(path: string | null): Diagnostic[] {
    return path ? (this.diagnostics.value.get(path) ?? []) : [];
  }

  set(path: string, list: Diagnostic[]): void {
    const next = new Map(this.diagnostics.value);
    next.set(path, list);
    this.diagnostics.value = next;
  }

  /** A new answer arrived about one server: we throw the old one about it away. */
  setStatus(status: LspStatus): void {
    this.statuses.value = [...this.statuses.value.filter((s) => s.server !== status.server), status];
  }

  /** The project changed — nothing said about the old one is about anything now. */
  reset(): void {
    this.diagnostics.value = new Map();
    this.statuses.value = [];
  }
}
