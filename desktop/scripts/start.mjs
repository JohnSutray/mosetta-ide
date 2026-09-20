import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deviceBuild } from './build.mjs';

/**
 * `pnpm desktop`: build in place and start Electron. The same `DeviceBuild` as the
 * installation uses — one build rather than two.
 */
await deviceBuild.all();

const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [path.join(deviceBuild.out, 'main.cjs')], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
