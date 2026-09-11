import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fs.mkdirSync(path.join(pkg, 'defaults'), { recursive: true });
fs.copyFileSync(path.join(pkg, '..', 'config', 'keymap.json'), path.join(pkg, 'defaults', 'keymap.json'));
