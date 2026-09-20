/**
 * The format of a script's id: `package::script`.
 *
 * A class of its own, because both halves of the plugin know the format — the server's
 * and the client's — and one place should know it.
 */
export class ScriptId {
  /** The separator, which also divides the string in two. */
  readonly sep = '::';

  /** The script's name from its id: everything after the last separator. */
  scriptOf(id: string): string {
    const at = id.lastIndexOf(this.sep);
    return at === -1 ? id : id.slice(at + this.sep.length);
  }

  /** The package's name: everything before the separator. */
  packageOf(id: string): string {
    const at = id.lastIndexOf(this.sep);
    return at === -1 ? '' : id.slice(0, at);
  }
}

/** One per plugin. */
export const scriptId = new ScriptId();
