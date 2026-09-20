import type { RegistryHandle } from '@mosetta/ide-api/client';
import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { FileViewLike, IndexHit, IndexKind, KindIcon, Opener, SearchAnswer, SearchSource, SearchStats, TagSpec } from './types.js';
import { terms } from './query.js';
import { Recall } from './recall.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';

/** The search server half — it arrives through the constructor. */
export interface SearchRemote {
  find(query: string, limit?: number, kinds?: IndexKind[]): Promise<SearchAnswer>;
  /** What the index managed to cover: we ask when the window opens. */
  stats(): Promise<SearchStats>;
}

/**
 * A list row: a section heading, or a hit.
 *
 * A heading has a COUNT and a state: a collapsed section hides its hits but not itself
 * — otherwise collapsing would be indistinguishable from switching a kind off with a
 * chip.
 */
export type SearchRow =
  | { header: string; kind: IndexKind; count: number; folded: boolean }
  | { hit: IndexHit; at: number };

/**
 * "Search everywhere" — a double Shift.
 *
 * The search is synchronous on the server (the index lies in memory), so we nudge it on
 * every keystroke with no delay: a pause here would only spoil the feel. We hold back
 * only the preview — it reads a file.
 */
export class Search {
  constructor(
    private readonly remote: SearchRemote,
    /** Who takes a hit of which kind: the `search.opener` key, ours. */
    private readonly openers: RegistryHandle<Opener>,
    /** Documents are a neighbour: open a hit, and look inside a file. */
    private readonly docs: () => Pick<DocPlugin, 'goTo' | 'peekFile'>,
    /**
     * How many hits to ask for on an EMPTY term — the `index.recentFiles` setting; 0
     * switches the question off entirely.
     *
     * There is no `search.recent` key any more: recent files answer an empty term as an
     * ordinary source of the commons. The setting stayed here, with the window: "how
     * many to show" is a property of the window rather than of whoever remembers the
     * visits.
     */
    private readonly recentLimit: () => number,
    /**
     * Who can show a file as something other than text: a neighbour's `file.view` key,
     * read as a string. No entries means everything as before.
     */
    private readonly views: RegistryHandle<FileViewLike>,
    /**
     * The commons: who else pours hits into this window. The `search.source` key,
     * asynchronous — a source is entitled to go to the server and into a child process.
     */
    private readonly sources: RegistryHandle<SearchSource>,
    /** Which kinds of hit the human has seen: the chip row is assembled from them. */
    private readonly seen: Signal<string[]>,
    /** Which they switched off. Two lists rather than a list of pairs. */
    private readonly hidden: Signal<string[]>,
    /**
     * Which sections are collapsed. Collapsing is NOT the same as switching off: a
     * source that is off is not asked at all, while a collapsed one answers, its hits
     * are counted in the heading, and they can be unfolded without waiting for a second
     * trip outwards.
     */
    private readonly folded: Signal<string[]>,
    /** Who draws a kind's icon: the `search.icon` key, ours. */
    private readonly icons: RegistryHandle<KindIcon>,
  ) {}

  readonly open = signal(false);
  readonly query = signal('');
  readonly hits = signal<IndexHit[]>([]);
  /**
   * How many matched in total. More than the length of the hits means we are showing
   * less than everything, and the window says so rather than the human guessing.
   */
  readonly total = signal(0);
  /**
   * The index's coverage — what it does not know. Asked when the window opens rather
   * than on every letter: coverage does not depend on the query.
   */
  readonly coverage = signal<SearchStats | null>(null);
  readonly selected = signal(0);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);

  /** How many hits we ask for. More than sixty is not read by eye anyway. */
  private readonly limit = 60;
  /** How long we wait before reading a file: an arrow moves faster than disk. */
  private readonly previewDelay = 90;
  /**
   * How long we wait before asking THE COMMONS. The index lies in memory and answers on
   * every letter; a source goes outwards, and nudging it on every keystroke means
   * paying for all the intermediate words the human has already deleted.
   */
  private readonly sourceDelay = 140;

  /**
   * The CURRENT results' ceiling: usually the limit, and on an empty term whatever the
   * recents setting says. It cuts the WINDOW rather than the source: "give me no more"
   * is a request, and a source is entitled not to hear it, while a list forty rows long
   * on an empty field is no longer "recent".
   */
  private shown = this.limit;

  /**
   * What has already turned up in this tab: the answer to a tag with an empty term is
   * built from it. A field of its own rather than a service: the counter belongs to the
   * window and dies with it.
   */
  readonly recall = new Recall();

  /**
   * The current query's term. Needed where the answer arrives later than the question:
   * showings may be counted only for a REAL search, otherwise the counter starts
   * confirming itself.
   */
  private asking = '';

  private sourceTimer: ReturnType<typeof setTimeout> | null = null;

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** An answer to an outdated query is thrown away: people type faster than it flies. */
  private token = 0;

  /**
   * The popup's rows: section headings and hits mixed together. Rows alike in meaning
   * gather into sections with an unselectable heading.
   */
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

  /**
   * A section's heading, by a hit's kind.
   *
   * Not a table but a rule: the kind `npm` gives the key `search.kind.npm`. A table was
   * closed, whereas the set of kinds is now open — the suppliers bring them. A foreign
   * kind has no label in the core and never will: it arrives in the dictionary of the
   * very plugin that brought the hits.
   */
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

  /**
   * The chip row above the results.
   *
   * A kind of hit appears in the row BY ITSELF as soon as somebody brings it: the
   * TypeScript symbols put a `ts` section into the commons — and the `ts` chip exists.
   * So the list accumulates and is remembered: a chip must not vanish because a source
   * happened to stay silent today.
   *
   * The colour speaks of being enabled, as in the project search. There is no
   * strikethrough here: there is one row, and we do not give the sign a second meaning.
   */
  readonly kinds: ReadonlySignal<string[]> = computed(() => this.seen.value);

  /**
   * The sources' notes: what each of them does not cover.
   *
   * They are NOT always shown. "Three files have no symbols" used to hang under the
   * field permanently, on any query and even an empty one, and the user asked: why do I
   * always see this type. The note was the truth, but a truth written always stops
   * being read — exactly like red that is always red.
   *
   * The moment it is needed is named precisely: **the human asked, and the source did
   * not answer.** Then "why is it empty" is a live question, and coverage answers it.
   * If a source found something, nobody asks about its holes; if nothing was asked at
   * all (an empty field when the window opens) — all the more so.
   *
   * A source switched off by a chip is always silent: its hits are absent anyway, and
   * it has nothing to complain about.
   */
  readonly notes: ReadonlySignal<Array<{ key: string; params?: Record<string, string | number>; setting?: string }>> = computed(() => {
    const { tags, term } = terms.parse(this.query.value);
    if (term === '' && tags.length === 0) return [];
    const answered = new Set(this.hits.value.map((hit) => hit.kind));
    return this.sources.all.value
      .filter((one) => !this.hidden.value.includes(one.kind) && !answered.has(one.kind))
      .map((one) => one.note?.() ?? null)
      .filter((one): one is { key: string; params?: Record<string, string | number>; setting?: string } => one !== null);
  });

  isOff(kind: string): boolean {
    return this.hidden.value.includes(kind);
  }

  /** A click on a chip: remove a kind from the results, or bring it back. */
  toggleKind(kind: string): void {
    const off = this.hidden.value;
    this.hidden.value = off.includes(kind) ? off.filter((one) => one !== kind) : [...off, kind];
    void this.run(this.query.value);
  }

  /**
   * Whether a section is collapsed.
   *
   * Two different actions on one kind, and the difference is named in words: a CHIP
   * switches the source off — it is not asked, there are no hits, and it reports no
   * coverage; a CHEVRON hides what has already been found — the number in the heading
   * stays, and it shows what lies there. One collapses in order to see a neighbouring
   * section whole rather than to stop searching.
   */
  isFolded(kind: string): boolean {
    return this.folded.value.includes(kind);
  }

  toggleSection(kind: string): void {
    const folded = this.folded.value;
    this.folded.value = folded.includes(kind) ? folded.filter((one) => one !== kind) : [...folded, kind];
    this.settle();
  }

  /**
   * A hit's icon.
   *
   * The kind is named by whoever brought it: the `search.icon` key. Whatever is not in
   * the key follows one rule for everybody: a path to a file is drawn with the file's
   * icon, and a hit without a file is left without one. A sheet of paper under a
   * setting would assert that it is a file.
   */
  iconFor(hit: IndexHit): unknown {
    const own = this.icons.all.value.find((one) => one.kind === hit.kind);
    if (own) return own.icon(hit);
    return null;
  }

  /**
   * Put the caret on a visible row. Collapse the section under the caret and the caret
   * moves to the first visible row rather than staying in the invisible.
   */
  private settle(): void {
    const hits = this.hits.value;
    const at = this.selected.value;
    if (hits[at] && !this.isFolded(hits[at].kind)) return;
    const next = hits.findIndex((hit) => !this.isFolded(hit.kind));
    this.selected.value = next < 0 ? 0 : next;
    this.schedulePreview();
  }

  /**
   * Remember a kind somebody brought. A chip is created on the very first hit and stays
   * forever: a chip that has vanished is a filter that has disappeared rather than
   * empty results.
   */
  private note(kinds: Iterable<string>): void {
    const next = new Set(this.seen.value);
    const before = next.size;
    for (const kind of kinds) next.add(kind);
    if (next.size !== before) this.seen.value = [...next].sort();
  }

  /** The key that opened the window closes it. */
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
    this.recall.picked(hit);
    this.close();

    const opener = this.openers.all.value.find((one) => one.kind === hit.kind);
    if (opener) {
      opener.open(hit);
      return;
    }

    void this.docs().goTo(hit.path, hit.line ?? 0);
  }

  /**
   * What comes higher in the list. First the match score, and on a tie, whatever turned
   * up more often. One order for every case instead of a special rule for an empty
   * term: there the scores are zero for everybody, and the counter decides by itself.
   */
  private readonly better = (a: IndexHit, b: IndexHit): number =>
    b.score - a.score || this.recall.countOf(b) - this.recall.countOf(a);

  private async run(value: string): Promise<void> {
    const token = ++this.token;
    const { tags: typed, term } = terms.parse(value);
    const tags = this.expand(typed);
    if (term === '') {
      batch(() => {
        this.hits.value = [];
        this.total.value = 0;
        this.selected.value = 0;
        this.preview.value = null;
      });
      const limit = tags.length > 0 ? this.limit : this.recentLimit();
      this.shown = limit;
      this.asking = '';
      if (limit > 0) this.askSources(term, tags, token, limit, 0);
      return;
    }
    this.shown = this.limit;
    this.asking = term;
    this.askSources(term, tags, token, this.limit, this.sourceDelay);
    try {
      const answer = await this.remote.find(term, this.limit);
      if (token !== this.token) return;
      this.note(answer.hits.map((hit) => hit.kind));
      const kept = answer.hits.filter((hit) => !this.isOff(hit.kind) && terms.keeps(hit, tags));
      this.recall.saw(kept);
      batch(() => {
        this.hits.value = this.groupByKind([...kept].sort(this.better));
        this.total.value = tags.length === 0 ? answer.total : kept.length;
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

  /**
   * Ask the commons — after the typing pause.
   *
   * The chips are created from a source's DECLARED kind rather than from its hits:
   * otherwise a source that is off is not asked, there are no hits, and the chip that
   * would switch it back on disappears.
   *
   * Tags narrow THE CIRCLE OF THOSE ASKED: a source that does not mark its hits with
   * such a tag and is not called that itself cannot answer — and calling it means
   * paying for somebody else's trip outwards. The same economy as a disabled chip, only
   * asked for with a line in the field.
   */
  private askSources(value: string, tags: string[], token: number, limit: number, delay: number): void {
    if (this.sourceTimer) clearTimeout(this.sourceTimer);
    const sources = this.sources.all.value;
    this.note(sources.map((one) => one.kind));
    const asked = sources.filter((one) => !this.isOff(one.kind) && this.answers(one, tags));
    if (asked.length === 0) return;
    const ask = () => {
      this.sourceTimer = null;
      for (const source of asked) {
        void Promise.resolve()
          .then(() => source.find({ term: value, tags, limit }))
          .then((hits) => {
            if (token !== this.token || hits.length === 0) return;
            this.absorb(hits.filter((hit) => terms.keeps(hit, tags)));
          })
          .catch(() => undefined);
      }
    };
    if (delay <= 0) ask();
    else this.sourceTimer = setTimeout(ask, delay);
  }

  /** Whether a source can answer such tags at all. */
  private answers(source: SearchSource, tags: string[]): boolean {
    if (tags.length === 0) return true;
    const own = [source.kind, ...(source.tags?.() ?? []).map(nameOf)].map((one) => one.toLowerCase());
    return tags.every((tag) => own.includes(tag));
  }

  /**
   * The tags' short names: `c` → `class`, `fn` → `function`. They are declared by
   * whoever owns the tag; the window expands them BEFORE asking, so that the source
   * receives the full name and knows nothing of the abbreviations.
   */
  private readonly shorts: ReadonlySignal<Map<string, string>> = computed(() => {
    const map = new Map<string, string>();
    for (const source of this.sources.all.value) {
      for (const spec of source.tags?.() ?? []) {
        if (typeof spec === 'string') continue;
        map.set(spec.short.toLowerCase(), spec.name.toLowerCase());
      }
    }
    return map;
  });

  /** Expand the short names. A full name stays itself. */
  private expand(tags: string[]): string[] {
    return tags.map((tag) => this.shorts.value.get(tag) ?? tag);
  }

  /**
   * The tags somebody promises: the kinds of hit plus what the sources declared.
   * Nothing typed outside that list exists for anybody — and staying silent about it is
   * not on: empty results from a typo in a tag look exactly like "there is no such
   * thing".
   */
  readonly known: ReadonlySignal<string[]> = computed(() => {
    const all = new Set<string>(this.seen.value.map((one) => one.toLowerCase()));
    for (const source of this.sources.all.value) {
      all.add(source.kind.toLowerCase());
      for (const spec of source.tags?.() ?? []) {
        all.add(nameOf(spec).toLowerCase());
        if (typeof spec !== 'string') all.add(spec.short.toLowerCase());
      }
    }
    return [...all];
  });

  /** Typed tags nobody promises. Empty means we stay silent. */
  readonly strayTags: ReadonlySignal<string[]> = computed(() => {
    const { tags } = terms.parse(this.query.value);
    return tags.filter((tag) => !this.known.value.includes(tag));
  });

  /**
   * Pour a source's hits into the results.
   *
   * A late answer does NOT MOVE what is selected: a human presses Enter on what they
   * see, and symbols arrive a hundred milliseconds after files. So what is selected is
   * looked up by itself and stays under the caret, even if new hits have landed above
   * it.
   */
  private absorb(extra: IndexHit[]): void {
    const chosen = this.current.value;
    const key = (hit: IndexHit): string => `${hit.kind}\u0000${hit.path}\u0000${hit.label}\u0000${hit.line ?? ''}`;
    const seen = new Set(this.hits.value.map(key));
    const fresh = extra.filter((hit) => !this.isOff(hit.kind) && !seen.has(key(hit)));
    if (fresh.length === 0) return;
    this.note(fresh.map((hit) => hit.kind));
    if (this.asking !== '') this.recall.saw(fresh);
    const merged = this.groupByKind(
      [...this.hits.value, ...fresh].sort(this.better).slice(0, this.shown),
    );
    const at = chosen ? merged.findIndex((hit) => key(hit) === key(chosen)) : -1;
    batch(() => {
      this.hits.value = merged;
      this.total.value += fresh.length;
      if (at >= 0) this.selected.value = at;
      else if (this.selected.value >= merged.length) this.selected.value = Math.max(0, merged.length - 1);
    });
    this.settle();
    if (!chosen) this.schedulePreview();
  }

  /**
   * Gather the hits into sections while keeping the order's meaning.
   *
   * The server hands them over strictly by score, and mixed together that reads badly:
   * the headings "symbols / files / symbols / files" flicker every other row. So the
   * kinds go in blocks, and the blocks' order is decided by the best result inside each
   * — that is, what came first stays first.
   */
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

/** A tag's name: the short declaration and the full one are written with one type. */
function nameOf(spec: TagSpec): string {
  return typeof spec === 'string' ? spec : spec.name;
}
