import { signal } from '@preact/signals';
import type { Visit } from './types.js';
import type DocPlugin from '@mosetta/ide-plugin-doc';
import { type Mount } from '@mosetta/ide-api/client';

/** What the list asks of the server: read the project's history, and write it. */
export interface VisitsRemote {
  list(): Promise<Visit[]>;
  save(visits: Visit[]): Promise<unknown>;
}

export class Visits {
  readonly list = signal<Visit[]>([]);
  /** Where we are in the list right now. -1 means nowhere yet. */
  readonly at = signal(-1);

  /** How many rows already count as a jump rather than as moving through the text. */
  private readonly far = 12;
  /** How many steps we remember. The server truncates to the same number. */
  private readonly limit = 30;
  /** How long we wait before writing the history to the server. */
  private readonly saveDelay = 800;
  /**
   * How long we write no visits after a jump. Opening a file moves the caret twice —
   * when the editor is born and when the line is revealed — and neither of those
   * movements should be recorded as a new place.
   */
  private readonly settleDelay = 400;

  /**
   * While we are walking through the history, new visits are not recorded: otherwise a
   * "back" would immediately be recorded as a new place, and there would be nowhere
   * left to go "forward" to.
   */
  private walking = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * The server arrives through the constructor: the plugin calls its own server half
   * through `@remote`, and the list has no business knowing that — a test substitutes
   * its own.
   */
  constructor(private readonly remote: VisitsRemote,
    /** Documents are a neighbour: the jump to a place. */
    private readonly docs: () => Pick<DocPlugin, 'goTo'>,
  ) {}

  canGoBack(): boolean {
    return this.at.value > 0;
  }

  canGoForward(): boolean {
    return this.at.value >= 0 && this.at.value < this.list.value.length - 1;
  }

  /** Load the project's history. The server has already thrown the dead rows away. */
  async load(): Promise<void> {
    try {
      const list = await this.remote.list();
      this.list.value = list;
      this.at.value = list.length - 1;
    } catch {
      this.forget();
    }
  }

  forget(): void {
    this.list.value = [];
    this.at.value = -1;
  }

  /** Note that the caret has been somewhere. Called often — the filter is inside. */
  visit(path: string, line: number, character = 0): void {
    if (this.walking) return;
    const next = this.next(this.list.value, this.at.value, path, line, character);
    if (!next) return;
    this.list.value = next.list;
    this.at.value = next.at;
    this.schedule();
  }

  /**
   * What the list turns into after a visit. A pure method: the rules here are delicate,
   * and checking them by eye will not work.
   *
   * Returns `null` if nothing changed: writing a signal the same value means waking
   * everyone watching it for no reason.
   */
  next(
    list: Visit[],
    at: number,
    path: string,
    line: number,
    character = 0,
    far = this.far,
    limit = this.limit,
  ): { list: Visit[]; at: number } | null {
    const here = list[at];
    if (here && here.path === path && Math.abs(here.line - line) < far) {
      if (here.line === line && (here.character ?? 0) === character) return null;
      const updated = [...list];
      updated[at] = { path, line, character };
      return { list: updated, at };
    }
    const kept = list.slice(0, at + 1).slice(-(limit - 1));
    const next = [...kept, { path, line, character }];
    return { list: next, at: next.length - 1 };
  }

  /**
   * Recent FILES, freshest first.
   *
   * Not the same thing as the caret history: one file lies in that as many rows as
   * there were places jumped to inside it, and a list of "recent files" made of those
   * would be half one and the same file. So we walk from the end and take each path
   * ONCE — together with the line we were last at in it: one returns to where one left
   * off.
   *
   * A pure method: the rule is simple, and checking it by eye will not work anyway —
   * the order IS the content of the list.
   */
  recentFiles(limit: number): Array<{ path: string; line: number }> {
    const out: Array<{ path: string; line: number }> = [];
    if (limit <= 0) return out;
    const seen = new Set<string>();
    const list = this.list.value;
    for (let i = list.length - 1; i >= 0 && out.length < limit; i -= 1) {
      const visit = list[i];
      if (!visit || seen.has(visit.path)) continue;
      seen.add(visit.path);
      out.push({ path: visit.path, line: visit.line });
    }
    return out;
  }

  back(): void {
    if (!this.canGoBack()) return;
    void this.jump(this.at.value - 1);
  }

  forward(): void {
    if (!this.canGoForward()) return;
    void this.jump(this.at.value + 1);
  }

  /**
   * The mouse's side buttons are the caret history: lower goes back, upper goes
   * forward.
   *
   * Suppressing the event is mandatory, and mandatory on `mousedown`: otherwise the
   * browser understands them its own way and goes back through the TAB's history,
   * taking the whole session with it.
   */
  installMouseNav(mount: Pick<Mount, 'listen'>): () => void {
    const noMenu = (event: Event) => event.preventDefault();

    const onDown = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.button === 3) this.back();
      else this.forward();
    };
    const swallow = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) event.preventDefault();
    };
    const offs = [
      mount.listen('contextmenu', noMenu, { capture: true }),
      mount.listen('mousedown', onDown, { capture: true }),
      mount.listen('auxclick', swallow, { capture: true }),
      mount.listen('mouseup', swallow, { capture: true }),
    ];
    return () => {
      for (const off of offs) off();
    };
  }

  private async jump(to: number): Promise<void> {
    const target = this.list.value[to];
    if (!target) return;
    this.walking = true;
    this.at.value = to;
    try {
      await this.docs().goTo(target.path, target.line, target.character);
    } finally {
      setTimeout(() => {
        this.walking = false;
      }, this.settleDelay);
    }
  }

  /** We do not write on every step: a history is not a journal, it is read whole. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.remote.save(this.list.peek()).catch(() => undefined);
    }, this.saveDelay);
  }
}
