import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { FileHit, GrepResult } from './grep.js';
import { MaskChips, type ChipsWire } from './chips.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export type FilesMode = 'find' | 'replace';
export type FilesField = 'query' | 'replace' | 'mask' | 'exclude';

export interface FilesAsk {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  words: boolean;
  masks: string[];
  /** What not to look at at all: lock files, minified output. */
  excludes: string[];
}

export interface FindFilesRemote {
  grep(ask: FilesAsk): Promise<GrepResult>;
  replace(ask: FilesAsk & { replacement: string; paths?: string[] }): Promise<{ files: number; replaced: number }>;
}

export type FilesRow = { header: string; count: number } | { hit: FileHit; at: number };

/**
 * Find and replace across the project — the popup's state.
 *
 * The same drawing as "search everywhere": a field, a list, a preview. The differences
 * are substantive: the rows gather into sections by FILE rather than by kind; above the
 * field live the mask chips — they are a setting rather than the window's state, and
 * they outlive not only the tab but the machine.
 */
export class FindFiles {
  readonly open = signal(false);
  readonly mode = signal<FilesMode>('find');
  readonly query = signal('');
  readonly replacement = signal('');
  readonly caseSensitive = signal(false);
  readonly words = signal(false);
  readonly regex = signal(false);
  readonly hits = signal<FileHit[]>([]);
  readonly files = signal(0);
  /**
   * How many files the exclusions kept out. Not "how many matches were in them" — that
   * we do not know and do not want to: to find out, we would have to read exactly what
   * was decided not to read. Whereas "this many went past" is the truth, and saying it
   * is cheap.
   */
  readonly skipped = signal(0);
  readonly truncated = signal(false);
  readonly busy = signal(false);
  readonly selected = signal(0);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);
  /** Where to give the keyboard and when: a rising epoch nudges the effect. */
  readonly focus = signal<{ field: FilesField; epoch: number }>({ field: 'query', epoch: 0 });
  /** What to say after a replacement: "N replaced in M files". */
  readonly report = signal<{ files: number; replaced: number } | null>(null);

  private readonly delay = 150;
  private readonly previewDelay = 90;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  /** What to search: the row of chips above the results. */
  readonly masks: MaskChips;
  /** What not to search: the second row, eternally struck through. */
  readonly excludes: MaskChips;

  constructor(
    private readonly remote: FindFilesRemote,
    /** Both rows are a setting: we read them live and write through the core. */
    masks: ChipsWire,
    excludes: ChipsWire,
    private readonly complain: (message: string) => void,
    /** Documents are a neighbour: open a hit, and look inside a file. */
    private readonly docs: () => Pick<DocPlugin, 'goTo' | 'peekFile'>,
  ) {
    this.masks = new MaskChips(masks, complain, () => this.run());
    this.excludes = new MaskChips(excludes, complain, () => this.run());
  }

  readonly rows: ReadonlySignal<FilesRow[]> = computed(() => {
    const rows: FilesRow[] = [];
    const hits = this.hits.value;
    const perFile = new Map<string, number>();
    for (const hit of hits) perFile.set(hit.path, (perFile.get(hit.path) ?? 0) + 1);
    let previous: string | null = null;
    hits.forEach((hit, at) => {
      if (hit.path !== previous) {
        rows.push({ header: hit.path, count: perFile.get(hit.path) ?? 0 });
        previous = hit.path;
      }
      rows.push({ hit, at });
    });
    return rows;
  });

  readonly current: ReadonlySignal<FileHit | null> = computed(
    () => this.hits.value[this.selected.value] ?? null,
  );

  /**
   * Open in a mode; if it is open already, switch the mode without losing what was
   * typed.
   */
  show(mode: FilesMode): void {
    batch(() => {
      this.open.value = true;
      this.mode.value = mode;
      this.report.value = null;
    });
    this.focusOn('query');
    this.run();
  }

  close(): void {
    batch(() => {
      this.open.value = false;
      this.preview.value = null;
    });
  }

  /** The key that opened the window closes it — if the mode is the same. */
  toggle(mode: FilesMode): void {
    if (this.open.value && this.mode.value === mode) this.close();
    else this.show(mode);
  }

  setQuery(value: string): void {
    this.query.value = value;
    this.schedule();
  }

  setReplacement(value: string): void {
    this.replacement.value = value;
  }

  toggleCase(): void {
    this.caseSensitive.value = !this.caseSensitive.value;
    this.run();
  }

  toggleWords(): void {
    this.words.value = !this.words.value;
    this.run();
  }

  toggleRegex(): void {
    this.regex.value = !this.regex.value;
    this.run();
  }

  /**
   * Enter in a chip field adds a chip TO THE FIELD the caret is in. One command for
   * both rows, because there is one key: the surface calls itself `find-files-mask` in
   * both rows, and which of them is taking input right now is known to the focus.
   */
  addMask(): void {
    this.row().add();
  }

  /** The row currently being edited: by where the caret is. */
  private row(): MaskChips {
    return this.focus.value.field === 'exclude' ? this.excludes : this.masks;
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
    void this.docs().goTo(hit.path, hit.line, hit.from);
  }

  /**
   * Tab walks the fields: the term → the replacement → a mask → an exclusion → the
   * term.
   */
  nextField(): void {
    const order: FilesField[] =
      this.mode.value === 'replace' ? ['query', 'replace', 'mask', 'exclude'] : ['query', 'mask', 'exclude'];
    const at = order.indexOf(this.focus.value.field);
    this.focusOn(order[(at + 1) % order.length]!);
  }

  focusOn(field: FilesField): void {
    this.focus.value = { field, epoch: this.focus.value.epoch + 1 };
  }

  replaceAll(): void {
    void this.replaceIn(undefined);
  }

  /** Replace only inside the file of the selected hit. */
  replaceFile(): void {
    const hit = this.current.value;
    if (hit) void this.replaceIn([hit.path]);
  }

  ask(): FilesAsk {
    return {
      query: this.query.value,
      regex: this.regex.value,
      caseSensitive: this.caseSensitive.value,
      words: this.words.value,
      masks: this.masks.active.value,
      excludes: this.excludes.active.value,
    };
  }

  private async replaceIn(paths: string[] | undefined): Promise<void> {
    if (this.mode.value !== 'replace' || this.query.value === '') return;
    this.busy.value = true;
    try {
      const done = await this.remote.replace({
        ...this.ask(),
        replacement: this.replacement.value,
        ...(paths ? { paths } : {}),
      });
      this.report.value = done;
    } catch (err) {
      this.complain(describe(err));
    } finally {
      this.busy.value = false;
    }
    this.run();
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.run();
    }, this.delay);
  }

  private run(): void {
    const token = ++this.token;
    if (!this.open.value) return;
    if (this.query.value === '') {
      batch(() => {
        this.hits.value = [];
        this.files.value = 0;
        this.skipped.value = 0;
        this.truncated.value = false;
        this.selected.value = 0;
        this.preview.value = null;
      });
      return;
    }
    this.busy.value = true;
    void this.remote
      .grep(this.ask())
      .then((result) => {
        if (token !== this.token) return;
        batch(() => {
          this.hits.value = result.hits;
          this.files.value = result.files;
          this.skipped.value = result.skipped;
          this.truncated.value = result.truncated;
          this.selected.value = 0;
          this.busy.value = false;
        });
        this.schedulePreview();
      })
      .catch((err) => {
        if (token !== this.token) return;
        this.busy.value = false;
        this.complain(describe(err));
      });
  }

  private schedulePreview(): void {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    const hit = this.current.value;
    if (!hit) {
      this.preview.value = null;
      return;
    }
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      const token = this.token;
      void this.docs().peekFile(hit.path)
        .then((state) => {
          if (token !== this.token || !this.open.value) return;
          this.preview.value = { path: state.path, text: state.text, line: hit.line };
        })
        .catch(() => (this.preview.value = null));
    }, this.previewDelay);
  }
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
