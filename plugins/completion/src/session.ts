import { computed, signal } from '@preact/signals';
import type { Ranked, Ranker } from './ranker.js';
import type { Answer, Ask, Details, Item, Source } from './types.js';

const PAGE = 8;
const SETTLE_MS = 200;

export class CompletionSession {
  readonly active = signal(false);
  readonly items = signal<Ranked[]>([]);
  readonly selected = signal(0);
  readonly loading = signal(false);
  readonly details = signal<Details | null>(null);
  readonly started = signal(0);
  private readonly explicit = signal(false);
  readonly listed = computed(() => this.items.value.length > 0);
  readonly visible = computed(
    () => this.active.value && (this.listed.value || (this.explicit.value && this.loading.value)),
  );

  private asked: Ask | null = null;
  private query = '';
  private sources: readonly Source[] = [];
  private readonly answers = new Map<string, Answer>();
  private readonly asking = new Map<string, number>();
  private readonly pending = new Set<string>();
  private readonly resolving = new Map<string, Promise<Details | null>>();
  private readonly resolved = new Map<string, Details>();
  private generation = 0;
  private pinned = false;
  private shownAt: number | null = null;
  private told = false;

  constructor(
    private readonly ranker: Ranker,
    private readonly sourcesOf: () => readonly Source[],
    private readonly now: () => number = () => Date.now(),
    private readonly report: (what: 'empty' | 'failed', detail?: string) => void = () => undefined,
  ) {}

  get from(): number {
    return this.asked?.from ?? 0;
  }

  get ask(): Ask | null {
    return this.asked;
  }

  start(ask: Ask): void {
    this.generation += 1;
    this.asked = ask;
    this.query = ask.text.slice(ask.from, ask.pos);
    this.answers.clear();
    this.asking.clear();
    this.pending.clear();
    this.resolving.clear();
    this.resolved.clear();
    this.pinned = false;
    this.shownAt = null;
    this.told = false;
    this.loading.value = false;
    this.explicit.value = ask.explicit;
    this.sources = this.sourcesOf();
    this.active.value = true;
    this.started.value += 1;
    for (const source of this.sources) this.run(source, ask);
    this.rerank(true);
    this.checkEmpty();
  }

  refine(ask: Ask): void {
    const asked = this.asked;
    if (!asked) return;
    this.asked = { ...ask, from: asked.from, trigger: asked.trigger, explicit: asked.explicit };
    this.query = ask.text.slice(asked.from, ask.pos);
    for (const source of this.sources) {
      if (this.answers.get(source.id)?.incomplete) this.run(source, this.asked);
    }
    this.pinned = false;
    this.rerank(true);
  }

  select(index: number): void {
    const count = this.items.value.length;
    this.selected.value = count === 0 ? 0 : Math.max(0, Math.min(index, count - 1));
    this.loadDetails();
  }

  move(delta: 1 | -1): void {
    const count = this.items.value.length;
    if (count === 0) return;
    this.pinned = true;
    this.select((((this.selected.value + delta) % count) + count) % count);
  }

  page(delta: 1 | -1): void {
    if (this.items.value.length === 0) return;
    this.pinned = true;
    this.select(this.selected.value + delta * PAGE);
  }

  current(): Ranked | null {
    return this.items.value[this.selected.value] ?? null;
  }

  settled(key: string): Details | null {
    return this.resolved.get(key) ?? null;
  }

  detailsOf(ranked: Ranked): Promise<Details | null> {
    const known = this.resolving.get(ranked.key);
    if (known) return known;
    const resolve = ranked.item.resolve;
    const promise = resolve
      ? resolve()
          .then((details) => {
            this.resolved.set(ranked.key, details);
            return details;
          })
          .catch(() => null)
      : Promise.resolve(null);
    this.resolving.set(ranked.key, promise);
    return promise;
  }

  close(): void {
    if (!this.active.value && this.asked === null) return;
    this.generation += 1;
    this.asked = null;
    this.pending.clear();
    this.active.value = false;
    this.items.value = [];
    this.selected.value = 0;
    this.details.value = null;
    this.loading.value = false;
    this.explicit.value = false;
  }

  private run(source: Source, ask: Ask): void {
    const generation = this.generation;
    const seq = (this.asking.get(source.id) ?? 0) + 1;
    this.asking.set(source.id, seq);
    let answer: Answer | Promise<Answer>;
    try {
      answer = source.items(ask);
    } catch {
      return;
    }
    if (!('then' in answer)) {
      this.answers.set(source.id, answer);
      return;
    }
    this.pending.add(source.id);
    this.loading.value = true;
    const fresh = () => generation === this.generation && this.asking.get(source.id) === seq;
    answer.then(
      (late) => {
        if (!fresh()) return;
        this.answers.set(source.id, late);
        this.settle(source.id);
        this.rerank(false);
        this.checkEmpty();
      },
      (error: unknown) => {
        if (!fresh()) return;
        this.tell('failed', `${source.id}: ${error instanceof Error ? error.message : String(error)}`);
        this.settle(source.id);
        this.checkEmpty();
      },
    );
  }

  private checkEmpty(): void {
    if (!this.active.value || !this.explicit.value || this.pending.size > 0 || this.items.value.length > 0) return;
    this.tell('empty');
    this.close();
  }

  private tell(what: 'empty' | 'failed', detail?: string): void {
    if (this.told) return;
    this.told = true;
    this.report(what, detail);
  }

  private settle(id: string): void {
    this.pending.delete(id);
    this.loading.value = this.pending.size > 0;
  }

  private merge(): Item[] {
    const all: Item[] = [];
    for (const source of this.sources) all.push(...(this.answers.get(source.id)?.items ?? []));
    const typed = new Set(all.filter((item) => item.kind !== 'word').map((item) => item.label));
    return all.filter((item) => item.kind !== 'word' || !typed.has(item.label));
  }

  private rerank(reset: boolean): void {
    const weights = new Map(this.sources.map((source) => [source.id, source.weight] as const));
    const ranked = this.ranker.rank(this.merge(), this.query, weights);
    const before = this.current()?.key;
    const read = this.shownAt !== null && this.now() - this.shownAt >= SETTLE_MS;
    const keep = !reset && before !== undefined && (this.pinned || read);
    this.items.value = ranked;
    if (ranked.length === 0) this.shownAt = null;
    else this.shownAt ??= this.now();
    const at = keep ? ranked.findIndex((one) => one.key === before) : -1;
    this.select(Math.max(0, at));
  }

  private loadDetails(): void {
    const current = this.current();
    const known = current ? (this.resolved.get(current.key) ?? null) : null;
    this.details.value = known;
    if (!current || known || !current.item.resolve) return;
    const generation = this.generation;
    void this.detailsOf(current).then((details) => {
      if (generation === this.generation && this.current()?.key === current.key) this.details.value = details;
    });
  }
}
