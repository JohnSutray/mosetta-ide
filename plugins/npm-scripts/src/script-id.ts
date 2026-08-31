export class ScriptId {
  readonly sep = '::';

  scriptOf(id: string): string {
    const at = id.lastIndexOf(this.sep);
    return at === -1 ? id : id.slice(at + this.sep.length);
  }

  packageOf(id: string): string {
    const at = id.lastIndexOf(this.sep);
    return at === -1 ? '' : id.slice(0, at);
  }
}

export const scriptId = new ScriptId();
