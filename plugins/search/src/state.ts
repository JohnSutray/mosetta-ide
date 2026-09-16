import type { RegistryHandle } from '@mosetta/ide-api/client';
import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { FileViewLike, IndexHit, IndexKind, KindIcon, Opener, Recent, SearchAnswer, SearchSource, SearchStats } from './types.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export interface SearchRemote {
  find(query: string, limit?: number, kinds?: IndexKind[]): Promise<SearchAnswer>;
  stats(): Promise<SearchStats>;
}

export type SearchRow =
  | { header: string; kind: IndexKind; count: number; folded: boolean }
  | { hit: IndexHit; at: number };

export class Search {
  constructor(
    private readonly remote: SearchRemote,
    private readonly openers: RegistryHandle<Opener>,
    private readonly docs: () => Pick<DocPlugin, 'goTo' | 'peekFile'>,
    private readonly recents: RegistryHandle<Recent>,
    private readonly recentLimit: () => number,
    private readonly views: RegistryHandle<FileViewLike>,
    private readonly sources: RegistryHandle<SearchSource>,
    private readonly seen: Signal<string[]>,
    private readonly hidden: Signal<string[]>,
    private readonly folded: Signal<string[]>,
    private readonly icons: RegistryHandle<KindIcon>,
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
  private readonly sourceDelay = 140;

  private sourceTimer: ReturnType<typeof setTimeout> | null = null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  readonly rows: ReadonlySignal<Array<SearchRow>> = computed(() => {
    const rows: SearchRow[] = [];
    const counts = new Map<IndexKind, number>();
    for (const hit of this.hits.value) counts.set(hit.kind, (counts.get(hit.kind) ?? 0) + 1);
    let previous: IndexKind | null = null;
    this.hits.value.forEach((hit, at) => {
      if (hit.kind !== previous) {
        rows.push({
          header: this.kindTitle(hit.kind),
          kind: hit.kind,
          count: counts.get(hit.kind) ?? 0,
          folded: this.isFolded(hit.kind),
        });
        previous = hit.kind;
      }
      if (!this.isFolded(hit.kind)) rows.push({ hit, at });
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

  readonly kinds: ReadonlySignal<string[]> = computed(() => this.seen.value);

  readonly notes: ReadonlySignal<Array<{ key: string; params?: Record<string, string | number>; setting?: string }>> = computed(() =>
    this.sources.all.value
      .filter((one) => !this.hidden.value.includes(one.kind))
      .map((one) => one.note?.() ?? null)
      .filter((one): one is { key: string; params?: Record<string, string | number>; setting?: string } => one !== null),
  );

  isOff(kind: string): boolean {
    return this.hidden.value.includes(kind);
  }

  toggleKind(kind: string): void {
    const off = this.hidden.value;
    this.hidden.value = off.includes(kind) ? off.filter((one) => one !== kind) : [...off, kind];
    void this.run(this.query.value);
  }

  isFolded(kind: string): boolean {
    return this.folded.value.includes(kind);
  }

  toggleSection(kind: string): void {
    const folded = this.folded.value;
    this.folded.value = folded.includes(kind) ? folded.filter((one) => one !== kind) : [...folded, kind];
    this.settle();
  }

  iconFor(hit: IndexHit): unknown {
    const own = this.icons.all.value.find((one) => one.kind === hit.kind);
    if (own) return own.icon(hit);
    return null;
  }

  private settle(): void {
    const hits = this.hits.value;
    const at = this.selected.value;
    if (hits[at] && !this.isFolded(hits[at].kind)) return;
    const next = hits.findIndex((hit) => !this.isFolded(hit.kind));
    this.selected.value = next < 0 ? 0 : next;
    this.schedulePreview();
  }

  private note(kinds: Iterable<string>): void {
    const next = new Set(this.seen.value);
    const before = next.size;
    for (const kind of kinds) next.add(kind);
    if (next.size !== before) this.seen.value = [...next].sort();
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
    const hits = this.hits.value;
    const total = hits.length;
    if (total === 0) return;
    let at = this.selected.value;
    for (let step = 0; step < total; step += 1) {
      at = (at + delta + total) % total;
      if (this.isFolded(hits[at]!.kind)) continue;
      this.selected.value = at;
      this.schedulePreview();
      return;
    }
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
      this.settle();
      this.schedulePreview();
      this.askSources(value, token);
      return;
    }
    this.askSources(value, token);
    try {
      const answer = await this.remote.find(value, this.limit);
      if (token !== this.token) return;
      this.note(answer.hits.map((hit) => hit.kind));
      batch(() => {
        this.hits.value = this.groupByKind(answer.hits.filter((hit) => !this.isOff(hit.kind)));
        this.total.value = answer.total;
        this.selected.value = 0;
      });
      this.settle();
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

  private askSources(value: string, token: number): void {
    if (this.sourceTimer) clearTimeout(this.sourceTimer);
    const sources = this.sources.all.value;
    this.note(sources.map((one) => one.kind));
    const asked = sources.filter((one) => !this.isOff(one.kind));
    if (asked.length === 0) return;
    this.sourceTimer = setTimeout(() => {
      this.sourceTimer = null;
      for (const source of asked) {
        void Promise.resolve()
          .then(() => source.find(value, this.limit))
          .then((hits) => {
            if (token !== this.token || hits.length === 0) return;
            this.absorb(hits);
          })
          .catch(() => undefined);
      }
    }, this.sourceDelay);
  }

  private absorb(extra: IndexHit[]): void {
    const chosen = this.current.value;
    const key = (hit: IndexHit): string => `${hit.kind}\u0000${hit.path}\u0000${hit.label}\u0000${hit.line ?? ''}`;
    const seen = new Set(this.hits.value.map(key));
    const fresh = extra.filter((hit) => !this.isOff(hit.kind) && !seen.has(key(hit)));
    if (fresh.length === 0) return;
    this.note(fresh.map((hit) => hit.kind));
    const merged = this.groupByKind(
      [...this.hits.value, ...fresh].sort((a, b) => b.score - a.score).slice(0, this.limit),
    );
    const at = chosen ? merged.findIndex((hit) => key(hit) === key(chosen)) : -1;
    batch(() => {
      this.hits.value = merged;
      this.total.value += fresh.length;
      if (at >= 0) this.selected.value = at;
      else if (this.selected.value >= merged.length) this.selected.value = Math.max(0, merged.length - 1);
    });
    this.settle();
  }

  private recent(): IndexHit[] {
    const limit = this.recentLimit();
    this.note(this.recents.all.value.map((one) => one.kind));
    if (limit <= 0) return [];
    const hits: IndexHit[] = [];
    for (const source of this.recents.all.value) {
      if (this.isOff(source.kind)) continue;
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
