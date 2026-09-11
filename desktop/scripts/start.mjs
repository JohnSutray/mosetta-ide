import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { deviceBuild } from './build.mjs';

await deviceBuild.all();

const electron = createRequire(import.meta.url)('electron');
const child = spawn(electron, [path.join(deviceBuild.out, 'main.cjs')], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
