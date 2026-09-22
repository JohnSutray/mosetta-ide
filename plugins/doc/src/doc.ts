import { batch, computed, signal, type ReadonlySignal, type Signal } from '@preact/signals';
import type { DocState } from '@mosetta/ide-protocol';
import { RpcErrorCode } from '@mosetta/ide-protocol';
import type { DocWire } from '@mosetta/ide-api/client';
import { DocSync } from './sync.js';

/** Where to jump. The epoch rises so that jumping to the same place again works. */
export interface Reveal {
  path: string;
  line: number;
  /**
   * The column to land on (zero-based). Absent means the start of the line. A language
   * server names the place in full, and there is no point losing half the answer on the
   * way.
   */
  character?: number;
  epoch: number;
}

/**
 * How the document speaks to a human and what it remembers: the services arrive through
 * the constructor.
 */
export interface DocServices {
  say(message: string): void;
  complain(message: string): void;
  /** One line per slot: autosave complains on every loss of focus. */
  sayOnce(slot: string, message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
  /** The TAB's memory: which file is open in this project. */
  remembered(root: string): Signal<string | null>;
}

/**
 * The open document.
 *
 * The memory layer as seen from the tab: the text, the version, the dirtiness and the
 * divergence from disk. The editor takes all of that from here — which means another
 * editor would take the same. It used to live in the core; now the core hands over the
 * WIRE (`docs`: the protocol's methods and the layer's events) and remembering is our
 * job.
 *
 * Exactly one is open: we have no tabs, and a panel is a place rather than a document.
 */
export class Doc {
  readonly open = signal<DocState | null>(null);
  readonly dirty = signal(false);

  /**
   * A file opened by something OTHER than a document.
   *
   * An image is not pulled into memory and does not become a document at all — but it
   * can still be opened, and then a FILE is open and it has no text. Lying about that
   * with a `DocState` holding empty text is not on: empty text means an empty file
   * rather than "there is no text here".
   *
   * Exactly one per tab, like the document: a panel is a place rather than a list. So
   * the two signals put each other out.
   */
  readonly viewed = signal<string | null>(null);

  /**
   * What was open before the current one, newest first. Needed for exactly one thing:
   * the file vanished from under the editor — go back to the previous one.
   */
  readonly history = signal<string[]>([]);

  /**
   * A counter of text replacements from OUTSIDE (re-read from disk, somebody else's
   * edit pulled in). A rising epoch is a signal to "replace the document with a
   * transaction" rather than to "rebuild it": the editor has its own undo history and
   * its own caret.
   */
  readonly externalEpoch = signal(0);

  /**
   * The OPEN number: it rises when another file was opened and does not rise when the
   * same one moves. The editor is rebuilt from it rather than from the path — otherwise
   * renaming reset the undo history and the caret.
   */
  readonly openEpoch = signal(0);
  /**
   * How many times an open was ASKED for.
   *
   * Apart from `openEpoch`: that rises when another editor was born, whereas asking to
   * open a file that is already open changes nothing — and neighbours to whom "the
   * user asked to see the code" matters could not see it. A counter rather than a
   * flag: a second request in a row has to work too.
   */
  readonly openAsked = signal(0);

  readonly pendingReveal = signal<Reveal | null>(null);

  /**
   * Files whose memory has diverged from disk. Not an accident but a FACT about one
   * file, and it lives where the file does: as a strip above the editor.
   */
  readonly diverged = signal<Map<string, 'changed' | 'removed'>>(new Map());

  readonly sync: DocSync;

  /** The open file's path on its own: a panel needs to tell "this one" from "that one". */
  readonly path: ReadonlySignal<string | null> = computed(() => this.open.value?.path ?? null);

  /**
   * The last edit that has not reached the server yet.
   *
   * Needed by views that draw what they edit: markup, SVG. `DocState.text` arrives from
   * the server and lags by one exchange — a view standing on it would twitch every
   * other time.
   */
  private readonly typed = signal<{ path: string; text: string; at: number } | null>(null);

  /**
   * The LIVE text of the open document: what is visible in the editor right now.
   *
   * Our own edit while the server has not confirmed it; after that, the document's
   * text. We tell them apart by VERSION: our echo raises it, and from that moment the
   * truth belongs to the document. Somebody else's edit raises it the same way, so
   * "re-read from disk" does not show our stale typing.
   */
  readonly text: ReadonlySignal<string> = computed(() => {
    const doc = this.open.value;
    if (!doc) return '';
    const local = this.typed.value;
    return local && local.path === doc.path && doc.version <= local.at ? local.text : doc.text;
  });

  /**
   * Paths whose external change we were EXPECTING: a merge's result arrives by the same
   * event as somebody else's edit, but saying "the file changed outside" a second after
   * "confirm" is a lie.
   */
  private readonly expected = new Set<string>();

  /** Who shows the argument: the merge screen subscribes, the document asks. */
  private readonly mergeRequests = new Set<(path: string) => void>();
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly wire: DocWire,
    private readonly services: DocServices,
  ) {
    this.sync = new DocSync(
      wire,
      (message) => services.complain(message),
      () => void this.adoptFromServer(),
    );
    this.listen();
  }

  reveal(path: string, line: number, character?: number): void {
    const epoch = (this.pendingReveal.value?.epoch ?? 0) + 1;
    this.pendingReveal.value = { path, line, character, epoch };
  }

  /**
   * Show a file that needs no document: an image. The open document closes in the
   * process — there is one place.
   */
  async view(path: string, root: string | null): Promise<void> {
    await this.close(root);
    batch(() => {
      this.viewed.value = path;
      this.history.value = [path, ...this.history.value.filter((item) => item !== path)].slice(0, 20);
    });
    if (root) this.services.remembered(root).value = path;
  }

  async openAt(path: string, root: string | null): Promise<void> {
    try {
      const previous = this.open.value;
      if (previous && previous.path !== path) {
        await this.sync.flush();
        void this.wire.close(previous.path);
      }
      const doc = await this.wire.open(path);
      this.sync.attach(doc);
      this.noteDiverged(doc);
      if (previous?.path !== path) this.openEpoch.value += 1;
      batch(() => {
        this.history.value = [path, ...this.history.value.filter((item) => item !== path)].slice(0, 20);
        this.open.value = doc;
        this.dirty.value = doc.dirty;
        this.viewed.value = null;
      });
      if (root) this.services.remembered(root).value = path;
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  /** Close the open file. The editor panel stays — empty. */
  async close(root: string | null): Promise<void> {
    const file = this.open.value;
    if (!file) {
      if (this.viewed.value === null) return;
      this.viewed.value = null;
      if (root) this.services.remembered(root).value = null;
      return;
    }
    try {
      await this.sync.flush();
    } finally {
      this.sync.detach();
      void this.wire.close(file.path);
      if (root) this.services.remembered(root).value = null;
      batch(() => {
        this.open.value = null;
        this.dirty.value = false;
      });
    }
  }

  /**
   * A NEIGHBOUR changed the text rather than the editor.
   *
   * Reverting a hunk from the git strip used to call `edit` — and the text honestly
   * travelled to the server while the screen stayed as it was: CodeMirror's contents
   * are changed only by itself, and it agrees to take somebody else's by
   * `externalEpoch`. A human pressed "Revert", nothing happened, and they saw the
   * result only after reloading the page.
   *
   * So a neighbour has a door of their own: the same edit, plus the document's new
   * state and a request to take it. The editor must not be given this door — it calls
   * `edit` on every keystroke, and the epoch would jerk its contents on every letter.
   */
  replace(text: string): void {
    const open = this.open.peek();
    if (!open) return;
    this.edit(text);
    batch(() => {
      this.open.value = { ...open, text };
      this.externalEpoch.value += 1;
    });
  }

  /**
   * An edit from the editor. The text travels into the server's memory rather than onto
   * disk.
   */
  edit(text: string): void {
    const open = this.open.peek();
    if (open) this.typed.value = { path: open.path, text, at: open.version };
    this.dirty.value = true;
    this.sync.edit(text);
  }

  /**
   * Take the text from the server as it is: a second tab was editing the same file. By
   * the same route as an external edit — the epoch rises and the editor changes its
   * contents with a transaction.
   */
  private async adoptFromServer(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      const doc = await this.wire.state(file.path);
      if (this.open.value?.path !== file.path) return;
      this.sync.attach(doc);
      this.noteDiverged(doc);
      batch(() => {
        this.open.value = doc;
        this.dirty.value = doc.dirty;
        this.externalEpoch.value += 1;
      });
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  /** The core asks for the argument about a file to be shown. Returns a withdrawal. */
  onMergeRequested(handler: (path: string) => void): () => void {
    this.mergeRequests.add(handler);
    return () => {
      this.mergeRequests.delete(handler);
    };
  }

  /** A save ran into it, or the strip was clicked: whoever draws merging, show it. */
  requestMerge(path: string): void {
    for (const handler of this.mergeRequests) handler(path);
  }

  /**
   * Write the open document to disk.
   *
   * `auto` means we wrote it OURSELVES (autosave, starting a program) rather than by a
   * keystroke. There is exactly one difference and it is about who asked the question:
   * an argument with disk during our own write does not unfold the merge screen (the
   * rule says "the user just asked", and here they did not) and it complains with ONE
   * line per slot — otherwise every loss of focus would add another.
   */
  async save(options?: { auto?: boolean }): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      await this.sync.flush();
      const saved = await this.wire.save(file.path);
      this.forgetDiverged(file.path);
      if (this.open.peek()?.path !== file.path) return;
      this.sync.attach(saved);
      batch(() => {
        this.open.value = saved;
        this.dirty.value = false;
      });
    } catch (err) {
      if (codeOf(err) === RpcErrorCode.RevisionConflict) {
        if (options?.auto) {
          this.services.sayOnce('doc.autosave', this.services.t('doc.autosave.blocked', { path: file.path }));
          return;
        }
        this.requestMerge(file.path);
        return;
      }
      if (options?.auto) this.services.sayOnce('doc.autosave', describe(err));
      else this.services.complain(describe(err));
    }
  }

  async reload(): Promise<void> {
    const file = this.open.value;
    if (!file) return;
    try {
      const doc = await this.wire.reload(file.path);
      this.forgetDiverged(file.path);
      if (this.open.peek()?.path !== file.path) return;
      this.sync.attach(doc);
      batch(() => {
        this.open.value = doc;
        this.dirty.value = false;
        this.externalEpoch.value += 1;
      });
      this.services.say(this.services.t('file.reloaded', { path: doc.path }));
    } catch (err) {
      this.services.complain(describe(err));
    }
  }

  expectExternal(path: string): void {
    this.expected.add(path);
  }

  /**
   * Remember what the server said about the argument with disk.
   *
   * The map used to be filled ONLY by the `doc.diverged` event, and so it survived
   * exactly one session of the tab: reload the page and the strip was gone, although
   * the document had still diverged from disk. Now the state arrives in `DocState`, and
   * opening a file tells the truth from the first second.
   */
  private noteDiverged(doc: { path: string; diverged?: 'changed' | 'removed' }): void {
    const has = this.diverged.value.has(doc.path);
    if (doc.diverged) {
      if (this.diverged.value.get(doc.path) === doc.diverged) return;
      const next = new Map(this.diverged.value);
      next.set(doc.path, doc.diverged);
      this.diverged.value = next;
      return;
    }
    if (!has) return;
    const next = new Map(this.diverged.value);
    next.delete(doc.path);
    this.diverged.value = next;
  }

  /** They met again: it was saved, reloaded, or the argument was settled. */
  forgetDiverged(path: string): void {
    if (!this.diverged.value.has(path)) return;
    const next = new Map(this.diverged.value);
    next.delete(path);
    this.diverged.value = next;
  }

  /**
   * What the tab considers open: a document, a view, or whatever was remembered. Needed
   * by whoever decides HOW to open it.
   */
  remembers(root: string): string | null {
    return this.open.peek()?.path ?? this.viewed.peek() ?? this.services.remembered(root).peek();
  }

  async attached(root: string): Promise<void> {
    const path = this.remembers(root);
    if (!path) return;
    const alive = await this.wire.state(path).catch(() => null);
    if (alive) await this.openAt(path, root);
    else this.services.remembered(root).value = null;
  }

  /** The tab's project changed — nothing about the old one is about anything any more. */
  reset(): void {
    this.sync.detach();
    batch(() => {
      this.open.value = null;
      this.viewed.value = null;
      this.dirty.value = false;
      this.history.value = [];
      this.diverged.value = new Map();
      this.pendingReveal.value = null;
    });
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  private listen(): void {
    this.offs.push(
      this.wire.onChanged((event) => {
        if (this.open.value?.path !== event.path) return;
        this.dirty.value = event.dirty;
        if (event.version !== this.sync.version && !this.sync.busy) void this.adoptFromServer();
      }),
      this.wire.onExternal((event) => {
        const asked = this.expected.delete(event.path);
        this.forgetDiverged(event.path);
        if (this.open.value?.path !== event.path) return;
        void this.wire
          .state(event.path)
          .then((doc) => {
            this.sync.attach(doc);
            batch(() => {
              this.open.value = doc;
              this.dirty.value = doc.dirty;
              this.externalEpoch.value += 1;
            });
            if (!asked) this.services.say(this.services.t('file.external', { path: event.path }));
          })
          .catch((err) => this.services.complain(describe(err)));
      }),
      this.wire.onDiverged((event) => {
        const next = new Map(this.diverged.value);
        next.set(event.path, event.reason);
        this.diverged.value = next;
      }),
      this.wire.onMoved((event) => {
        this.history.value = this.history.value.map((path) => (path === event.from ? event.path : path));
        if (this.open.value?.path !== event.from) return;
        void this.wire
          .state(event.path)
          .then((doc) => {
            this.sync.attach(doc);
            batch(() => {
              this.open.value = doc;
              this.dirty.value = doc.dirty;
            });
          })
          .catch((err) => this.services.complain(describe(err)));
      }),
      this.wire.onRemoved((event) => {
        if (this.open.value?.path !== event.path) return;
        const back = this.history.value.find((path) => path !== event.path);
        batch(() => {
          this.history.value = this.history.value.filter((path) => path !== event.path);
          this.open.value = null;
          this.dirty.value = false;
        });
        this.sync.detach();
        this.services.complain(this.services.t('file.gone', { path: event.path }));
        if (back) void this.openAt(back, null);
      }),
    );
  }
}

function codeOf(err: unknown): number | undefined {
  return err && typeof err === 'object' && 'code' in err ? (err as { code?: number }).code : undefined;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
