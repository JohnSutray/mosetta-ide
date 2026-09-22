import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/**
 * node-pty's `spawn-helper`, made executable.
 *
 * node-pty 1.1.0 ships its prebuilt `spawn-helper` without the execute bit — in the npm
 * tarball itself — and pnpm drops the bit on its own as well. Without it every terminal
 * fails with `posix_spawnp failed`, a message that names nothing. The plugin that brings
 * node-pty mends it when it comes up, so an install from npm and a checkout behave alike.
 * Windows has no helper and nothing to mend.
 */
export class PtyHelper {
  constructor(
    /** The plugin's own directory: node-pty resolves from there. */
    private readonly from: string,
    private readonly warn: (message: string) => void,
  ) {}

  mend(): number {
    if (process.platform === 'win32') return 0;
    let root: string;
    try {
      root = path.dirname(createRequire(path.join(this.from, 'noop.js')).resolve('node-pty/package.json'));
    } catch {
      return 0;
    }
    let fixed = 0;
    for (const dir of [path.join(root, 'prebuilds'), path.join(root, 'build', 'Release')]) {
      if (!fs.existsSync(dir)) continue;
      for (const helper of this.helpers(dir)) {
        try {
          const mode = fs.statSync(helper).mode;
          if ((mode & 0o111) === 0o111) continue;
          fs.chmodSync(helper, mode | 0o755);
          fixed += 1;
        } catch (err) {
          this.warn(`could not make ${helper} executable: ${String(err)}; terminals will not open`);
        }
      }
    }
    return fixed;
  }

  private helpers(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.helpers(at));
      else if (entry.name === 'spawn-helper') out.push(at);
    }
    return out;
  }
}
