import { doc, rpc } from './session.js';
import { complain, say } from './notifications.js';
import { diff3, type Region, type Choice, type SideChoice } from '../merge/diff3.js';
import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { MergeFile, MergeSession } from '@ide/protocol';
import { t } from '../i18n/index.js';

export class Merge {
  readonly session = signal<MergeSession | null>(null);
  readonly open = signal(false);
  readonly path = signal<string | null>(null);

  private readonly decisions = signal<Map<string, Choice[]>>(new Map());

  private readonly cursorRaw: Signal<number | null> = signal(null);

  private readonly promised = new Set<string>();

  readonly pending: ReadonlySignal<number> = computed(
    () => this.session.value?.files.filter((file) => !file.done).length ?? 0,
  );

  readonly file: ReadonlySignal<MergeFile | null> = computed(() => {
    const session = this.session.value;
    if (!session) return null;
    const wanted = this.path.value;
    return (
      session.files.find((file) => file.path === wanted) ??
      session.files.find((file) => !file.done) ??
      session.files[0] ??
      null
    );
  });

  readonly regions: ReadonlySignal<Region[]> = computed(() => {
    const file = this.file.value;
    if (!file || file.left.text === null || file.right.text === null) return [];
    return diff3.regions(file.base ?? '', file.left.text, file.right.text);
  });

  readonly choices: ReadonlySignal<Choice[]> = computed(() => {
    const file = this.file.value;
    const regions = this.regions.value;
    if (!file) return [];
    const stored = this.decisions.value.get(file.path);
    if (stored && stored.length === regions.length) return stored;
    return diff3.defaultChoices(regions);
  });

  readonly result: ReadonlySignal<string> = computed(() =>
    diff3.buildText(this.regions.value, this.choices.value),
  );

  readonly ready: ReadonlySignal<boolean> = computed(() => {
    const file = this.file.value;
    if (!file) return false;
    if (file.left.text === null || file.right.text === null) return false;
    return diff3.allDecided(this.regions.value, this.choices.value);
  });

  readonly conflicts: ReadonlySignal<number[]> = computed(() =>
    this.regions.value
      .map((region, at) => ({ region, at }))
      .filter(({ region }) => region.kind === 'conflict')
      .map(({ at }) => at),
  );

  readonly cursor: ReadonlySignal<number> = computed(() => {
    const raw = this.cursorRaw.value;
    if (raw !== null && this.regions.value[raw]) return raw;
    return this.conflicts.value[0] ?? 0;
  });

  readonly left: ReadonlySignal<number> = computed(() => {
    const regions = this.regions.value;
    const choices = this.choices.value;
    return regions.filter((region, at) =>
      diff3.undecided(region, choices[at] ?? { left: null, right: null }),
    ).length;
  });

  constructor() {
    doc.whenSaveConflicts((path) => this.openFor(path));

    rpc.on('merge.state', (state) => {
      const had = this.session.value !== null;
      this.session.value = state;
      if (!state) {
        batch(() => {
          this.open.value = false;
          this.path.value = null;
          this.decisions.value = new Map();
        });
        return;
      }
      for (const path of [...this.promised]) {
        if (this.focusOn(path)) this.promised.delete(path);
      }

      if (!had) say(t('merge.appeared', { count: String(state.files.length) }));
    });
  }

  setCursor(at: number): void {
    this.cursorRaw.value = at;
  }

  openFor(path: string): void {
    if (this.focusOn(path)) return;
    this.promised.add(path);
  }

  async fromDisk(path: string): Promise<void> {
    try {
      const session = await rpc.call('doc.mergeFromDisk', { path });
      batch(() => {
        this.session.value = session;
        if (session) {
          this.path.value = path;
          this.cursorRaw.value = null;
          this.open.value = true;
        }
      });
    } catch (err) {
      complain(describeMerge(err));
    }
  }

  show(): void {
    if (!this.session.value) {
      say(t('merge.none'));
      return;
    }
    this.open.value = true;
  }

  close(): void {
    this.open.value = false;
  }

  toggle(): void {
    if (this.open.value) this.close();
    else this.show();
  }

  pickFile(path: string): void {
    batch(() => {
      this.path.value = path;
      this.cursorRaw.value = null;
    });
  }

  stepFile(delta: number): void {
    const session = this.session.value;
    const current = this.file.value;
    if (!session || !current) return;
    const at = session.files.findIndex((file) => file.path === current.path);
    const next = session.files[(at + delta + session.files.length) % session.files.length];
    if (next) this.pickFile(next.path);
  }

  stepConflict(delta: number): void {
    const spots = this.conflicts.value;
    if (spots.length === 0) return;
    const here = this.cursor.value;
    const at = spots.indexOf(here);
    if (at === -1) {
      const forward = spots.find((spot) => spot > here);
      const back = [...spots].reverse().find((spot) => spot < here);
      this.cursorRaw.value = (delta > 0 ? forward : back) ?? (delta > 0 ? spots[0]! : spots.at(-1)!);
      return;
    }
    this.cursorRaw.value = spots[(at + delta + spots.length) % spots.length]!;
  }

  decide(at: number, side: 'left' | 'right', choice: SideChoice): void {
    const file = this.file.value;
    if (!file) return;
    const next = this.choices.value.map((item) => ({ ...item }));
    const target = next[at];
    if (!target) return;
    target[side] = choice;
    if (this.regions.value[at]?.kind === 'both') {
      target.left = choice;
      target.right = choice;
    }
    this.remember(file.path, next);
  }

  decideHere(side: 'left' | 'right', choice: SideChoice): void {
    this.decide(this.cursor.value, side, choice);
    if (choice !== null) this.stepConflict(1);
  }

  acceptSide(side: 'left' | 'right'): void {
    const file = this.file.value;
    if (!file) return;
    if (file.left.text === null || file.right.text === null) {
      void this.resolve(side === 'left' ? file.left.text : file.right.text);
      return;
    }
    this.remember(file.path, diff3.takeSide(this.regions.value, side));
  }

  async resolve(text?: string | null): Promise<void> {
    const file = this.file.value;
    if (!file) return;
    const payload = text === undefined ? this.result.value : text;
    doc.expectExternal(file.path);
    try {
      const rest = await rpc.call('merge.resolve', { path: file.path, text: payload });
      doc.forgetDiverged(file.path);
      batch(() => {
        this.session.value = rest;
        this.decisions.value = without(this.decisions.value, file.path);
        this.cursorRaw.value = null;
        this.path.value = rest?.files.find((item) => !item.done)?.path ?? null;
        if (!rest) this.open.value = false;
      });
      if (!rest) say(t('merge.done'));
    } catch (err) {
      complain(describeMerge(err));
    }
  }

  async cancel(): Promise<void> {
    try {
      await rpc.call('merge.cancel', null);
    } catch (err) {
      complain(describeMerge(err));
      return;
    }
    batch(() => {
      this.session.value = null;
      this.open.value = false;
      this.decisions.value = new Map();
    });
  }

  async load(): Promise<void> {
    try {
      this.session.value = await rpc.call('merge.state', null);
    } catch {
      this.session.value = null;
    }
  }

  reset(): void {
    batch(() => {
      this.session.value = null;
      this.open.value = false;
      this.path.value = null;
      this.cursorRaw.value = null;
      this.decisions.value = new Map();
      this.promised.clear();
    });
  }

  isUndecided(at: number): boolean {
    const region = this.regions.value[at];
    const choice = this.choices.value[at];
    if (!region || !choice) return false;
    return diff3.undecided(region, choice);
  }

  private focusOn(path: string): boolean {
    const file = this.session.value?.files.find((item) => item.path === path && !item.done);
    if (!file) return false;
    batch(() => {
      this.path.value = path;
      this.cursorRaw.value = null;
      this.open.value = true;
    });
    return true;
  }

  private remember(path: string, choices: Choice[]): void {
    const next = new Map(this.decisions.value);
    next.set(path, choices);
    this.decisions.value = next;
  }
}

function without(map: Map<string, Choice[]>, path: string): Map<string, Choice[]> {
  const next = new Map(map);
  next.delete(path);
  return next;
}

function describeMerge(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) return String(err.message);
  return String(err);
}

export const merge = new Merge();
