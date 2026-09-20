/**
 * node-pty arrives with ready-made binaries, but pnpm unpacks them out of its store
 * without the execute bit. Without it `posix_spawnp` throws, the terminals do not open
 * at all, and the error message does not name the reason.
 *
 * We mend it after every install rather than by hand once: otherwise the next `pnpm
 * install` on another machine repeats the same evening of debugging.
 *
 * We look by walking `node_modules/.pnpm` rather than through `require.resolve`: the
 * script is run from the workspace's root, while node-pty is a dependency not of it but
 * of the terminal plugin (`@mosetta/ide-plugin-terminal`; before that, of the `server`
 * package), and from the root it does not resolve. The first version of this script
 * quietly did nothing for exactly that reason. The walk survived the move by itself: it
 * looks through the store rather than by owner.
 */
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pnpmRoot = path.resolve(here, '..', 'node_modules', '.pnpm');

if (!existsSync(pnpmRoot)) process.exit(0);

let found = 0;
let fixed = 0;

for (const entry of readdirSync(pnpmRoot)) {
  if (!entry.startsWith('node-pty@')) continue;
  const prebuilds = path.join(pnpmRoot, entry, 'node_modules', 'node-pty', 'prebuilds');
  if (!existsSync(prebuilds)) continue;
  for (const platform of readdirSync(prebuilds)) {
    const helper = path.join(prebuilds, platform, 'spawn-helper');
    if (!existsSync(helper)) continue;
    found += 1;
    const mode = statSync(helper).mode;
    if (mode & 0o111) continue;
    chmodSync(helper, mode | 0o755);
    fixed += 1;
  }
}

if (found === 0) {
  console.warn('node-pty: found no helpers — the terminals may not open');
} else if (fixed > 0) {
  console.log(`node-pty: put the execute bit back on ${fixed} of ${found} helpers`);
}
