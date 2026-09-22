/**
 * What is unsaved BEFORE a program is run.
 *
 * The program reads the DISK while the user looks at the memory. Let those two part
 * company and the debugger stops on the wrong line, or does not stop at all, and the
 * reason will be looked for anywhere but in the unsaved file. So the asking has to come
 * BEFORE the run: said afterwards, it is said when the old code has already set off.
 *
 * A class of its own rather than three methods on the plugin: there is one rule here
 * and it is checked with no DOM, no modal and no adapter — "with autosave there is no
 * question at all" is a statement about the order of calls, and it has to be written
 * down as a test rather than as a comment.
 */
export interface BeforeRunServices {
  /** What is not saved — as paths; the memory layer is asked rather than the open file. */
  unsaved(): Promise<string[]>;
  /**
   * Whether the document writes itself: then the user has already answered the
   * question with a setting.
   */
  autosaves(): boolean;
  /** Write it all down; returns what it did NOT manage to write. */
  save(): Promise<string[]>;
  /** Ask the user. `true` is "save and run", `false` is a refusal. */
  ask(question: { title: string; text: string; confirm: string }): Promise<boolean>;
  complain(message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
}

/** How many files to list; the rest as a number. */
const LISTED = 12;

export class BeforeRun {
  constructor(private readonly services: BeforeRunServices) {}

  /** Whether running is allowed. `false` means they refused, or it did not save. */
  async ready(): Promise<boolean> {
    const unsaved = await this.services.unsaved();
    if (unsaved.length === 0) return true;
    if (this.services.autosaves()) return this.saveThem();
    const yes = await this.services.ask({
      title: this.services.t('debug.unsaved.title'),
      text: `${this.services.t('debug.unsaved.why', { count: unsaved.length })}\n${this.list(unsaved)}`,
      confirm: this.services.t('debug.unsaved.save'),
    });
    return yes ? this.saveThem() : false;
  }

  /**
   * It did not save — we do NOT run, and we say exactly what. An argument with the disk
   * means there is a third text there, and the run would be a run of goodness knows
   * what.
   */
  private async saveThem(): Promise<boolean> {
    const failed = await this.services.save();
    if (failed.length === 0) return true;
    this.services.complain(this.services.t('debug.unsaved.failed', { files: this.list(failed) }));
    return false;
  }

  /** The list of files as lines. We cut VISIBLY: a silent truncation lies. */
  private list(paths: readonly string[]): string {
    const shown = paths.slice(0, LISTED);
    const rest = paths.length - shown.length;
    return rest === 0 ? shown.join('\n') : `${shown.join('\n')}\n${this.services.t('debug.unsaved.more', { count: rest })}`;
  }
}
