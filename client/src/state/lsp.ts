import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { Diagnostic, LspStatus } from '@ide/protocol';

export class Lsp {
  readonly diagnostics = signal<Map<string, Diagnostic[]>>(new Map());
  readonly statuses = signal<LspStatus[]>([]);

  readonly brokenPaths: ReadonlySignal<Set<string>> = computed(() => {
    const out = new Set<string>();
    for (const [path, list] of this.diagnostics.value) {
      if (!list.some((item) => item.severity === 'error')) continue;
      out.add(path);
      let at = path.lastIndexOf('/');
      while (at > 0) {
        out.add(path.slice(0, at));
        at = path.lastIndexOf('/', at - 1);
      }
    }
    return out;
  });

  readonly problems: ReadonlySignal<Array<{ path: string; diagnostics: Diagnostic[] }>> = computed(
    () => {
      const out: Array<{ path: string; diagnostics: Diagnostic[] }> = [];
      for (const [path, list] of this.diagnostics.value) {
        if (list.length > 0) out.push({ path, diagnostics: list });
      }
      out.sort((a, b) => a.path.localeCompare(b.path));
      return out;
    },
  );

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
