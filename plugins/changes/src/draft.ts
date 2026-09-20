import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * A draft commit message is the PROJECT's household.
 *
 * It used to be the tab's memory (`ide.remember`, scope `tab`), and that is too little:
 * a human writes a message for minutes, while they reload the tab, close it and open it
 * again; a second tab of the same project knew nothing of their text at all. Its place
 * is the same as the shelf's and the changelists': a file in the plugin's state
 * directory, keyed by the project's path. Not `settings.json` — that travels with the
 * human from machine to machine, whereas an unfinished message means something in
 * exactly one working tree.
 *
 * It is written with a delay (the client does that): a file per keystroke is a bad
 * trade, and losing the last word is no disaster while the text is on the screen
 * anyway.
 */
export class Draft {
  constructor(
    /** The PLUGIN's state directory: outside the project. */
    private readonly stateDir: () => string,
    /**
     * Whose household this is: `drafts` the message, `identity` the commit's signature.
     * One class for both, because they ask one question: "a string that belongs to THIS
     * working tree".
     */
    private readonly folder = 'drafts',
    private readonly ext = 'txt',
  ) {}

  fileFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), this.folder, `${name}-${hash}.${this.ext}`);
  }

  /** What has been typed. No file — an empty string rather than a refusal. */
  async read(root: string): Promise<string> {
    try {
      return await fs.readFile(this.fileFor(root), 'utf8');
    } catch {
      return '';
    }
  }

  /** An empty message is the absence of a file rather than a file with emptiness in it. */
  async write(root: string, text: string): Promise<void> {
    const file = this.fileFor(root);
    if (text === '') {
      await fs.rm(file, { force: true });
      return;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text, 'utf8');
  }
}
