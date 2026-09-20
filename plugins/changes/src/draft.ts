import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export class Draft {
  constructor(
    private readonly stateDir: () => string,
    private readonly folder = 'drafts',
    private readonly ext = 'txt',
  ) {}

  fileFor(root: string): string {
    const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
    const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
    return path.join(this.stateDir(), this.folder, `${name}-${hash}.${this.ext}`);
  }

  async read(root: string): Promise<string> {
    try {
      return await fs.readFile(this.fileFor(root), 'utf8');
    } catch {
      return '';
    }
  }

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
