import { batch, computed, signal, type ReadonlySignal } from '@preact/signals';
import type { FileHit, GrepResult } from './grep.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';

export type FilesMode = 'find' | 'replace';
export type FilesField = 'query' | 'replace' | 'mask';

export interface FilesAsk {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  words: boolean;
  masks: string[];
}

export interface FindFilesRemote {
  grep(ask: FilesAsk): Promise<GrepResult>;
  replace(ask: FilesAsk & { replacement: string; paths?: string[] }): Promise<{ files: number; replaced: number }>;
}

export type FilesRow = { header: string; count: number } | { hit: FileHit; at: number };

export class FindFiles {
  readonly open = signal(false);
  readonly mode = signal<FilesMode>('find');
  readonly query = signal('');
  readonly replacement = signal('');
  readonly caseSensitive = signal(false);
  readonly words = signal(false);
  readonly regex = signal(false);
  readonly maskDraft = signal('');
  readonly hits = signal<FileHit[]>([]);
  readonly files = signal(0);
  readonly truncated = signal(false);
  readonly busy = signal(false);
  readonly selected = signal(0);
  readonly preview = signal<{ path: string; text: string; line: number } | null>(null);
  readonly focus = signal<{ field: FilesField; epoch: number }>({ field: 'query', epoch: 0 });
  readonly report = signal<{ files: number; replaced: number } | null>(null);

  private readonly delay = 150;
  private readonly previewDelay = 90;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private token = 0;

  constructor(
    private readonly remote: FindFilesRemote,
    readonly masks: ReadonlySignal<string[]>,
    readonly masksOff: ReadonlySignal<string[]>,
    private readonly saveMasks: (list: string[]) => Promise<void>,
    private readonly saveMasksOff: (list: string[]) => Promise<void>,
    private readonly complain: (message: string) => void,
    private readonly docs: () => Pick<DocPlugin, 'goTo' | 'peekFile'>,
  ) {}

  readonly activeMasks: ReadonlySignal<string[]> = computed(() => {
    const off = new Set(this.masksOff.value);
    return this.masks.value.filter((one) => !off.has(one));
  });

  isOff(mask: string): boolean {
    return this.masksOff.value.includes(mask);
  }

  toggleMask(mask: string): void {
    const off = this.masksOff.value;
    const next = off.includes(mask) ? off.filter((one) => one !== mask) : [...off, mask];
    void this.saveMasksOff(next)
      .then(() => this.run())
      .catch((err) => this.complain(describe(err)));
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

  addMask(): void {
    const mask = this.maskDraft.value.trim();
    this.maskDraft.value = '';
    if (mask === '' || this.masks.value.includes(mask)) return;
    void this.saveMasks([...this.masks.value, mask])
      .then(() => this.run())
      .catch((err) => this.complain(describe(err)));
  }

  removeMask(mask: string): void {
    const off = this.masksOff.value;
    void this.saveMasks(this.masks.value.filter((one) => one !== mask))
      .then(() => (off.includes(mask) ? this.saveMasksOff(off.filter((one) => one !== mask)) : undefined))
      .then(() => this.run())
      .catch((err) => this.complain(describe(err)));
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

  nextField(): void {
    const order: FilesField[] =
      this.mode.value === 'replace' ? ['query', 'replace', 'mask'] : ['query', 'mask'];
    const at = order.indexOf(this.focus.value.field);
    this.focusOn(order[(at + 1) % order.length]!);
  }

  focusOn(field: FilesField): void {
    this.focus.value = { field, epoch: this.focus.value.epoch + 1 };
  }

  replaceAll(): void {
    void this.replaceIn(undefined);
  }

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
      masks: this.activeMasks.value,
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
