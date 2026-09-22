import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PtyHelper } from '../src/pty-helper.js';

/** node-pty's helper arrives without the execute bit from npm; the plugin gives it back. */
describe('PtyHelper', () => {
  it.skipIf(process.platform === 'win32')('makes every spawn-helper executable, once', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pty-helper-'));
    const pty = path.join(root, 'node_modules', 'node-pty');
    fs.mkdirSync(path.join(pty, 'prebuilds', 'darwin-arm64'), { recursive: true });
    fs.writeFileSync(path.join(pty, 'package.json'), '{"name":"node-pty"}');
    const helper = path.join(pty, 'prebuilds', 'darwin-arm64', 'spawn-helper');
    fs.writeFileSync(helper, '');
    fs.chmodSync(helper, 0o644);

    const mend = new PtyHelper(root, () => undefined);
    expect(mend.mend()).toBe(1);
    expect(fs.statSync(helper).mode & 0o111).toBe(0o111);
    expect(mend.mend()).toBe(0);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
