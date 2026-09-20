import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer as createVite, type ViteDevServer } from 'vite';
import { boot, type RunningServer } from '../../server/src/server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

/**
 * A stand for checks with a real browser.
 *
 * Three processes, as a human has: our server on a random port, Vite with the client
 * (the backend's port arrives as the `VITE_IDE_PORT` variable, as in `dev:scratch`) and
 * Chrome. Specifically the REAL Chrome (`channel: 'chrome'`) rather than the Chromium
 * from Playwright's cache: the question the stand was set up for is "what does the
 * browser the human lives in do with a key".
 *
 * The config is the stand's (`server/test/fixtures/config`) rather than the personal
 * one: the language servers are off, and there is no point watching the disk.
 */
export class Stand {
  private constructor(
    readonly server: RunningServer,
    readonly vite: ViteDevServer,
    readonly browser: Browser,
    readonly page: Page,
    private readonly stateDir: string,
  ) {}

  /**
   * Whether there is a Chrome on this machine; without one the check is skipped LOUDLY.
   * Playwright looks for `channel: 'chrome'` along the same paths but does not hand
   * them outwards (`executablePath` knows only its own Chromium), so the list is
   * repeated here.
   */
  static async chromeHere(): Promise<boolean> {
    const candidates =
      process.platform === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
          ]
        : process.platform === 'win32'
          ? [
              path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
              path.join(process.env['LOCALAPPDATA'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            ]
          : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        return true;
      } catch {}
    }
    return false;
  }

  static async up(): Promise<Stand> {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ide-e2e-state-'));
    const server = await boot.start({
      port: 0,
      idleMs: 60_000,
      configDir: path.join(repo, 'server', 'test', 'fixtures', 'config'),
      stateDir,
      watchConfig: false,
      shellEnv: false,
    });

    const uiPort = await Stand.freePort();
    process.env['VITE_IDE_PORT'] = String(server.port);
    process.env['IDE_UI_PORT'] = String(uiPort);
    const clientDir = path.join(repo, 'client');
    const vite = await createVite({
      root: clientDir,
      configFile: path.join(clientDir, 'vite.config.ts'),
      logLevel: 'error',
    });
    await vite.listen();

    const browser = await chromium.launch({
      channel: 'chrome',
      headless: !process.env['E2E_HEADED'],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const stand = new Stand(server, vite, browser, page, stateDir);
    await page.goto(stand.url());
    await page.waitForFunction(
      () => Boolean(document.activeElement?.closest('[data-keys]')),
      null,
      { timeout: 60_000 },
    );
    return stand;
  }

  url(): string {
    return `http://127.0.0.1:${process.env['IDE_UI_PORT']}/`;
  }

  async down(): Promise<void> {
    await this.browser.close().catch(() => undefined);
    await this.vite.close().catch(() => undefined);
    await this.server.close().catch(() => undefined);
    await fs.rm(this.stateDir, { recursive: true, force: true }).catch(() => undefined);
  }

  private static freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        probe.close(() => (port ? resolve(port) : reject(new Error('no port was given out'))));
      });
      probe.on('error', reject);
    });
  }
}
