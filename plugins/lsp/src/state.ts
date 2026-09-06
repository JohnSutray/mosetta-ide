import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Diagnostic, FileDiagnostics, LspStatus } from './types.js';

export class Lsp {
  readonly diagnostics = signal<Map<string, Diagnostic[]>>(new Map());
  readonly statuses = signal<LspStatus[]>([]);

  readonly problems: ReadonlySignal<FileDiagnostics[]> = computed(() => {
    const out: FileDiagnostics[] = [];
    for (const [path, list] of this.diagnostics.value) {
      if (list.length > 0) out.push({ path, diagnostics: list });
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  });

  of(path: string | null): Diagnostic[] {
    return path ? (this.diagnostics.value.get(path) ?? []) : [];
  }

  set(path: string, list: Diagnostic[]): void {
    const next = new Map(this.diagnostics.value);
    next.set(path, list);
    this.diagnostics.value = next;
  }

  setStatus(status: LspStatus): void {
    this.statuses.value = [...this.statuses.value.filter((s) => s.server !== status.server), status];
  }

  reset(): void {
    this.diagnostics.value = new Map();
    this.statuses.value = [];
  }
}
