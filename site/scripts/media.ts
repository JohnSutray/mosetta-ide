import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';
import { createServer } from 'vite';

/**
 * The screenshots and the videos in the plugins' READMEs, recorded from the demo.
 *
 * Every picture is taken from `/play/` — the real client against the daemon the page
 * plays — in a fresh profile, and the scene is set the way a person would set it: with
 * commands, clicks and real key presses. Nothing is drawn by hand, so the pictures are
 * redone with one command whenever the interface changes.
 *
 * `pnpm media` records everything; `pnpm media tree search` only those scenes.
 * Recorded into `public/media/<plugin>/`: `shot.png`, and for moving scenes `demo.mp4`
 * and `demo.gif` (the GIF is what READMEs on GitHub and npm can show).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const out = path.join(site, 'public', 'media');
const run = promisify(execFile);

const VIEW = { width: 1280, height: 760 };

type Step = (page: Page) => Promise<void>;

interface Scene {
  /** Set up, then the screenshot is taken. */
  shot?: Step;
  /** Where to crop the screenshot: a selector whose box is taken. */
  clip?: string;
  /** Played while the video records. */
  demo?: Step;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function command(page: Page, id: string): Promise<void> {
  await page.evaluate((one) => (window as any).demo.ide.commands.run(one), id);
  await pause(350);
}

/** Open a file and put the caret on a line, the way a search hit does. */
async function open(page: Page, file: string, line = 0): Promise<void> {
  await page.evaluate(([one, at]) => (window as any).demo.goTo(one, at), [file, line] as const);
  await pause(500);
}

/** Put the caret on a word in the open editor. */
async function caret(page: Page, line: number, word: string, offset = 1): Promise<void> {
  await page.evaluate(
    ([at, what, shift]) => {
      const { EditorView } = (window as any).__ideApi.modules['@codemirror/view'];
      const view = EditorView.findFromDOM(document.querySelector('#ide .cm-editor'));
      const text = view.state.doc.line(at + 1);
      const pos = text.from + text.text.indexOf(what) + shift;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
    [line, word, offset] as const,
  );
  await pause(200);
}

async function type(page: Page, text: string, delay = 70): Promise<void> {
  await page.keyboard.type(text, { delay });
}

async function doubleShift(page: Page): Promise<void> {
  await page.keyboard.press('Shift');
  await pause(80);
  await page.keyboard.press('Shift');
  await pause(400);
}

async function terminalLine(page: Page, text: string): Promise<void> {
  await page.locator('#ide .xterm-helper-textarea').first().focus();
  await type(page, text, 60);
  await page.keyboard.press('Enter');
  await pause(500);
}


/** Call a method of a plugin's instance, by the package and a dotted path. */
async function call(page: Page, pkg: string, method: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    async ([name, dotted, rest]) => {
      const Ctor = (window as any).__ideApi.modules[name].default;
      const instance = (window as any).demo.ide.plugins.services('@mosetta/media').getPlugin(Ctor);
      const parts = (dotted as string).split('.');
      const fn = parts.pop()!;
      const owner = parts.reduce((at: any, key) => at[key], instance);
      await owner[fn](...(rest as unknown[]));
    },
    [pkg, method, args] as const,
  );
  await pause(500);
}

/** Point the mouse at a word in the open editor and wait for the hover. */
async function hover(page: Page, line: number, word: string): Promise<void> {
  const at = await page.evaluate(
    ([row, what]) => {
      const { EditorView } = (window as any).__ideApi.modules['@codemirror/view'];
      const view = EditorView.findFromDOM(document.querySelector('#ide .cm-editor'));
      const text = view.state.doc.line(row + 1);
      const box = view.coordsAtPos(text.from + text.text.indexOf(what) + 2);
      return { x: box.left + 2, y: (box.top + box.bottom) / 2 };
    },
    [line, word] as const,
  );
  await page.mouse.move(at.x, at.y);
  await pause(1500);
}

/** The pasture starts closed; its gate is the caption at the bottom. */
async function openPasture(page: Page): Promise<void> {
  const box = (await page.locator('#ide canvas').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 36);
  await pause(300);
}

const P = (short: string) => `@mosetta/ide-plugin-${short}`;

const SCENES: Record<string, Scene> = {
  layout: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 20);
      await command(page, 'terminal.create');
      await terminalLine(page, 'npm test');
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 20);
      await pause(800);
      for (const id of ['panel.problems', 'panel.changes', 'terminal.create', 'panel.problems', 'panel.changes']) {
        await command(page, id);
        await pause(900);
      }
    },
  },
  toolbar: {
    clip: '#ide .toolbar',
    shot: async (page) => {
      await command(page, 'terminal.create');
      await command(page, 'panel.problems');
    },
  },
  editor: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 22);
      await caret(page, 25, 'for (');
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 30);
      await caret(page, 33, 'shearAll');
      await pause(700);
      for (const key of ['Meta+d', 'Alt+Shift+ArrowDown', 'Meta+Slash']) {
        await page.keyboard.press(key);
        await pause(900);
      }
      await page.keyboard.press('Meta+z');
      await pause(500);
      await page.keyboard.press('Meta+z');
      await pause(500);
      await page.keyboard.press('Meta+z');
      await pause(800);
    },
  },
  code: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 16);
      await caret(page, 19, 'length', 6);
      await type(page, ' * 2');
      await pause(900);
      await page.locator('#ide .cm-gitmark.is-modified').first().click();
      await pause(900);
    },
  },
  git: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'git.branches');
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 20);
      await pause(700);
      await page.locator('#ide .cm-gitmark').first().click();
      await pause(1600);
      await page.locator('#ide button').filter({ hasText: /revert/i }).first().click();
      await pause(1500);
    },
  },
  changes: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'panel.changes');
      await call(page, P('changes'), 'diff.show', 'src/flock.ts');
    },
    demo: async (page) => {
      await command(page, 'panel.changes');
      await pause(700);
      await call(page, P('changes'), 'diff.show', 'src/flock.ts');
      await pause(1800);
      await call(page, P('changes'), 'diff.show', 'README.md');
      await pause(1800);
      await call(page, P('changes'), 'diff.close');
      await pause(800);
    },
  },
  merge: {
    shot: async (page) => {
      await open(page, 'src/sheep.ts', 14);
      await caret(page, 16, 'const bite', 0);
      await type(page, '// a smaller bite for lambs\n    ', 20);
      await pause(900);
      await page.evaluate(() => {
        const { daemon } = (window as any).demo;
        daemon.diverge('src/sheep.ts', daemon.files.saved('src/sheep.ts').replace('this.hunger * 0.2', 'this.hunger * 0.25'));
      });
      await pause(600);
      await call(page, P('merge'), 'fromDisk', 'src/sheep.ts');
      await pause(800);
    },
  },
  symbols: {
    shot: async (page) => {
      await open(page, 'src/sheep.ts', 0);
      await caret(page, 4, 'Sheep', 2);
      await page.keyboard.press('Meta+b');
      await pause(900);
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 6);
      await caret(page, 7, 'Sheep', 2);
      await pause(800);
      await page.keyboard.press('Meta+b');
      await pause(1600);
      await page.keyboard.press('Meta+b');
      await pause(1400);
      await page.keyboard.press('ArrowDown');
      await pause(700);
      await page.keyboard.press('ArrowDown');
      await pause(700);
      await page.keyboard.press('Enter');
      await pause(1200);
    },
  },
  find: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'find.files');
      await type(page, 'sheep');
      await pause(800);
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await pause(500);
      await command(page, 'find.files');
      await type(page, 'hunger', 150);
      await pause(1200);
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('ArrowDown');
        await pause(600);
      }
      await page.keyboard.press('Enter');
      await pause(1400);
    },
  },
  completion: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 18);
      await caret(page, 19, ';', 1);
      await page.keyboard.press('Enter');
      await type(page, 'this.sh', 90);
      await pause(900);
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 18);
      await caret(page, 19, ';', 1);
      await pause(600);
      await page.keyboard.press('Enter');
      await type(page, 'this.sheep.length.lo', 120);
      await pause(1200);
      await page.keyboard.press('Enter');
      await pause(1600);
    },
  },
  lsp: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 16);
      await hover(page, 24, 'unused');
    },
  },
  problems: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 16);
      await command(page, 'panel.problems');
    },
  },
  terminal: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'terminal.create');
      await terminalLine(page, 'git status');
      await terminalLine(page, 'npm test');
    },
    demo: async (page) => {
      await command(page, 'terminal.create');
      await terminalLine(page, 'ls src');
      await pause(500);
      await terminalLine(page, 'git status');
      await pause(900);
      await command(page, 'terminal.create');
      await terminalLine(page, 'npm run dev');
      await pause(5000);
    },
  },
  'npm-scripts': {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'scripts.open');
    },
    demo: async (page) => {
      await command(page, 'scripts.open');
      await pause(700);
      await type(page, 'test', 180);
      await pause(900);
      await page.keyboard.press('Enter');
      await pause(2200);
    },
  },
  rerun: {
    demo: async (page) => {
      await command(page, 'scripts.open');
      await type(page, 'test', 60);
      await page.keyboard.press('Enter');
      await pause(1800);
      await page.keyboard.press('Meta+Shift+Enter');
      await pause(1800);
      await page.keyboard.press('Meta+Shift+Enter');
      await pause(1800);
    },
  },
  debug: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 20);
      for (const [line, word] of [[25, 'for'], [26, 'one.wander'], [34, 'return']] as const) {
        await caret(page, line, word, 0);
        await command(page, 'debug.toggleBreakpoint');
      }
      await command(page, 'panel.debug');
    },
  },
  projects: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'projects.show');
    },
  },
  visits: {
    demo: async (page) => {
      await open(page, 'src/flock.ts', 6);
      await caret(page, 7, 'Sheep', 2);
      await pause(700);
      await page.keyboard.press('Meta+b');
      await pause(1400);
      await open(page, 'src/pasture.ts', 14);
      await pause(1200);
      for (const key of ['Meta+BracketLeft', 'Meta+BracketLeft', 'Meta+BracketRight']) {
        await page.keyboard.press(key);
        await pause(1300);
      }
    },
  },
  settings: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'settings.show');
    },
  },
  keymap: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await page.evaluate(() => (window as any).demo.ide.store.all('settings.reveal').value[0].reveal('keymap'));
      await pause(900);
    },
  },
  keys: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'keys.show');
      await page.keyboard.press('Meta+b');
      await pause(600);
    },
  },
  notifications: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'git.fetch');
      await pause(900);
    },
  },
  daemon: {
    clip: '#ide .toolbar-right',
    shot: async (page) => {
      await pause(16_000);
    },
  },
  theme: {
    shot: async (page) => {
      await open(page, 'src/sheep.ts', 0);
      await command(page, 'panel.changes');
      await command(page, 'git.branches');
    },
  },
  ui: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await page.locator('#ide .tree-name').filter({ hasText: /^flock\.ts$/ }).first().click({ button: 'right' });
      await pause(700);
    },
  },
  image: {
    shot: async (page) => {
      await open(page, 'logo.svg', 0);
      await pause(800);
    },
  },
  markdown: {
    shot: async (page) => {
      await open(page, 'README.md', 0);
      await pause(800);
    },
  },
  sheep: {
    shot: async (page) => {
      await openPasture(page);
      await pause(7000);
    },
    demo: async (page) => {
      await openPasture(page);
      await pause(10_000);
    },
  },
  doc: {
    shot: async (page) => {
      await open(page, 'src/sheep.ts', 10);
      await caret(page, 16, '0.2', 3);
      await type(page, '5');
      await pause(700);
      await page.evaluate(() => {
        const { daemon } = (window as any).demo;
        daemon.diverge('src/sheep.ts', daemon.files.saved('src/sheep.ts').replace('0.2', '0.25'));
      });
      await pause(700);
    },
  },
  tree: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await command(page, 'tree.follow');
      await page.getByText('test', { exact: true }).first().click();
      await pause(300);
      await page.getByText('docs', { exact: true }).first().click();
      await pause(300);
      await page.getByText('flock.ts', { exact: true }).first().click();
      await pause(400);
    },
    demo: async (page) => {
      await page.getByText('src', { exact: true }).first().click();
      await pause(700);
      await type(page, 'pas', 180);
      await pause(1200);
      await page.keyboard.press('Enter');
      await pause(900);
      await page.keyboard.press('Escape');
      await pause(900);
    },
  },
  search: {
    shot: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await doubleShift(page);
      await type(page, 'flock');
      await pause(700);
    },
    demo: async (page) => {
      await open(page, 'src/flock.ts', 0);
      await pause(600);
      await doubleShift(page);
      await type(page, 'shr', 200);
      await pause(1200);
      for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
      await type(page, 'npm ', 200);
      await pause(1200);
      await type(page, 'test', 200);
      await pause(1500);
    },
  },
};

async function recordShot(browser: Browser, url: string, name: string, scene: Scene): Promise<void> {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, url);
  await scene.shot!(page);
  await pause(400);
  const dir = path.join(out, name);
  await fs.mkdir(dir, { recursive: true });
  let clip: { x: number; y: number; width: number; height: number } | undefined;
  if (scene.clip) {
    const box = await page.locator(scene.clip).first().boundingBox();
    if (box) clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  await page.screenshot({ path: path.join(dir, 'shot.png'), ...(clip ? { clip } : {}) });
  await context.close();
}

async function recordDemo(browser: Browser, url: string, name: string, scene: Scene): Promise<void> {
  const raw = path.join(out, '.raw', name);
  await fs.rm(raw, { recursive: true, force: true });
  const context = await browser.newContext({ viewport: VIEW, recordVideo: { dir: raw, size: VIEW } });
  const page = await context.newPage();
  const started = Date.now();
  await ready(page, url);
  const trim = (Date.now() - started) / 1000;
  await pause(500);
  await scene.demo!(page);
  await pause(600);
  const video = page.video();
  await context.close();
  const webm = await video!.path();
  const dir = path.join(out, name);
  await fs.mkdir(dir, { recursive: true });
  const from = String(Math.max(0, trim).toFixed(2));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', from, '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-movflags', '+faststart', path.join(dir, 'demo.mp4')]);
  await run('ffmpeg', [
    '-y', '-loglevel', 'error', '-ss', from, '-i', webm,
    '-vf', 'fps=12,scale=880:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    path.join(dir, 'demo.gif'),
  ]);
}

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(`${url}/play/`);
  await page.waitForFunction(() => Boolean((window as any).demo) && document.querySelectorAll('#ide .panel').length >= 2, null, {
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const demo = (window as any).demo;
    demo.goTo = async (file: string, line: number) => {
      const modules = (window as any).__ideApi.modules;
      const Doc = modules['@mosetta/ide-plugin-doc'].default;
      const docs = demo.ide.plugins.services('@mosetta/media').getPlugin(Doc);
      await docs.goTo(file, line);
    };
  });
  await pause(600);
}

const wanted = process.argv.slice(2);
const names = Object.keys(SCENES).filter((name) => wanted.length === 0 || wanted.includes(name));

const server = await createServer({ root: site, configFile: path.join(site, 'vite.config.ts'), logLevel: 'error', server: { port: 0 } });
await server.listen();
const address = server.httpServer!.address();
const url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
const browser = await chromium.launch({ channel: 'chrome', headless: !process.env['MEDIA_HEADED'] });

try {
  for (const name of names) {
    const scene = SCENES[name]!;
    if (scene.shot) await recordShot(browser, url, name, scene);
    if (scene.demo) await recordDemo(browser, url, name, scene);
    console.log(`media: ${name}`);
  }
} finally {
  await browser.close();
  await server.close();
  await fs.rm(path.join(out, '.raw'), { recursive: true, force: true });
}
