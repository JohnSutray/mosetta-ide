export interface BeforeRunServices {
  unsaved(): Promise<string[]>;
  autosaves(): boolean;
  save(): Promise<string[]>;
  ask(question: { title: string; text: string; confirm: string }): Promise<boolean>;
  complain(message: string): void;
  t(key: string, params?: Record<string, string | number>): string;
}

const LISTED = 12;

export class BeforeRun {
  constructor(private readonly services: BeforeRunServices) {}

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

  private async saveThem(): Promise<boolean> {
    const failed = await this.services.save();
    if (failed.length === 0) return true;
    this.services.complain(this.services.t('debug.unsaved.failed', { files: this.list(failed) }));
    return false;
  }

  private list(paths: readonly string[]): string {
    const shown = paths.slice(0, LISTED);
    const rest = paths.length - shown.length;
    return rest === 0 ? shown.join('\n') : `${shown.join('\n')}\n${this.services.t('debug.unsaved.more', { count: rest })}`;
  }
}
