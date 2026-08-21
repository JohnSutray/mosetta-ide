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
  console.warn('node-pty: помощников не нашёл — терминалы могут не открыться');
} else if (fixed > 0) {
  console.log(`node-pty: вернул бит исполнения ${fixed} из ${found} помощников`);
}
