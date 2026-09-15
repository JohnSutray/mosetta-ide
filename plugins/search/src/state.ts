import type { RegistryHandle } from '@mosetta/ide-api/client';
import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { FileViewLike, IndexHit, IndexKind, Opener, Recent, SearchAnswer, SearchStats } from './types.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export interface SearchRemote {
  find(query: string, limit?: number, kinds?: IndexKind[]): Promise<SearchAnswer>;
  stats(): Promise<SearchStats>;
}

export class Search {
  constructor(
    private readonly remote: SearchRemote,
    private readonly openers: RegistryHandle<Opener>,
    private readonly docs: () => Pick<DocPlugin, 'goTo' | 'peekFile'>,
    private readonly recents: RegistryHandle<Recent>,
    private readonly recentLimit: () => number,
    private readonly views: RegistryHandle<FileViewLike>,
  ) {}

  readonly open = signal(false);
  readonly query = signal('');
  readonly hits = signal<IndexHit[]>([]);
  readonly total = signal(0);
  readonly coverage = signal<SearchStats | null>(null);
  readonly selected = signal(0);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);

  private readonly limit = 60;
  private readonly previewDelay = 90;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  readonly rows: ReadonlySignal<Array<{ header: string } | { hit: IndexHit; at: number }>> =
    computed(() => {
      const rows: Array<{ header: string } | { hit: IndexHit; at: number }> = [];
      let previous: IndexKind | null = null;
      this.hits.value.forEach((hit, at) => {
        if (hit.kind !== previous) {
          rows.push({ header: this.kindTitle(hit.kind) });
          previous = hit.kind;
        }
        rows.push({ hit, at });
      });
      return rows;
    });

  readonly current: ReadonlySignal<IndexHit | null> = computed(
    () => this.hits.value[this.selected.value] ?? null,
  );

  kindTitle(kind: IndexKind): string {
    return `search.kind.${kind}`;
  }

  show(): void {
    batch(() => {
      this.open.value = true;
      this.selected.value = 0;
    });
    void this.run(this.query.value);
    void this.remote
      .stats()
      .then((stats) => (this.coverage.value = stats))
      .catch(() => (this.coverage.value = null));
  }

  close(): void {
    batch(() => {
      this.open.value = false;
      this.preview.value = null;
    });
  }

  toggle(): void {
    if (this.open.value) this.close();
    else this.show();
  }

  setQuery(value: string): void {
    this.query.value = value;
    void this.run(value);
  }

  move(delta: number): void {
    const total = this.hits.value.length;
    if (total === 0) return;
    this.selected.value = (this.selected.value + delta + total) % total;
    this.schedulePreview();
  }

  selectAt(at: number): void {
    this.selected.value = at;
    this.schedulePreview();
  }

  accept(): void {
    const hit = this.current.value;
    if (!hit) return;
    this.close();

    const opener = this.openers.all.value.find((one) => one.kind === hit.kind);
    if (opener) {
      opener.open(hit);
      return;
    }

    void this.docs().goTo(hit.path, hit.line ?? 0);
  }

  private async run(value: string): Promise<void> {
    const token = ++this.token;
    if (value.trim() === '') {
      batch(() => {
        const recent = this.recent();
        this.hits.value = recent;
        this.total.value = recent.length;
        this.selected.value = 0;
        this.preview.value = null;
      });
      this.schedulePreview();
      return;
    }
    try {
      const answer = await this.remote.find(value, this.limit);
      if (token !== this.token) return;
      batch(() => {
        this.hits.value = this.groupByKind(answer.hits);
        this.total.value = answer.total;
        this.selected.value = 0;
      });
      this.schedulePreview();
    } catch {
      if (token === this.token) {
        batch(() => {
          this.hits.value = [];
          this.total.value = 0;
        });
      }
    }
  }

  private recent(): IndexHit[] {
    const limit = this.recentLimit();
    if (limit <= 0) return [];
    const hits: IndexHit[] = [];
    for (const source of this.recents.all.value) {
      for (const place of source.places(limit)) {
        hits.push({
          kind: source.kind,
          label: place.path,
          path: place.path,
          line: place.line,
          detail: place.detail,
          score: 0,
          matches: [],
        });
      }
    }
    return this.groupByKind(hits).slice(0, limit);
  }

  private groupByKind(hits: IndexHit[]): IndexHit[] {
    const groups = new Map<IndexKind, IndexHit[]>();
    for (const hit of hits) {
      const list = groups.get(hit.kind);
      if (list) list.push(hit);
      else groups.set(hit.kind, [hit]);
    }
    return [...groups.values()].flat();
  }

  private schedulePreview(): void {
    if (this.timer) clearTimeout(this.timer);
    const hit = this.current.value;
    if (!hit) {
      this.preview.value = null;
      return;
    }
    const shown = this.views.all.value.find((one) => one.opens(hit.path));
    if (shown?.text === false) {
      this.preview.value = { path: hit.path, text: '', line: hit.line ?? 0 };
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      const token = this.token;
      void this.docs().peekFile(hit.path)
        .then((state) => {
          if (token !== this.token || !this.open.value) return;
          this.preview.value = { path: state.path, text: state.text, line: hit.line ?? 0 };
        })
        .catch(() => (this.preview.value = null));
    }, this.previewDelay);
  }
}
