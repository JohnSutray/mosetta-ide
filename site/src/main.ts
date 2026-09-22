import { mount, type Core } from '@mosetta/ide-client/embed';
import { demoDial } from './demo/socket.js';
import type { Snapshot } from './demo/daemon.js';
import { PLUGINS } from './plugins.js';
import { mascot } from './mascot.js';
import './landing.css';

/**
 * Where the source lives; one constant, so the links move together. `null` until the
 * repository is public: a link to nowhere is worse than no link.
 */
const REPO: string | null = 'https://github.com/mosetta/mosetta-ide';

for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-repo]')) {
  if (REPO) link.href = REPO;
  else link.remove();
}

const grid = document.querySelector('[data-plugins]');
if (grid) {
  grid.innerHTML = PLUGINS.map(
    (one) => {
      const inner = `<span class="plugin-title">${one.title}</span>
        <span class="plugin-name">${one.name === 'api' ? '@mosetta/ide-api' : `@mosetta/ide-plugin-${one.name}`}</span>
        <span class="plugin-line">${one.line}</span>`;
      return REPO
        ? `<li class="plugin"><a class="plugin-card" href="${REPO}/tree/main/plugins/${one.name}#readme">${inner}</a></li>`
        : `<li class="plugin"><div class="plugin-card">${inner}</div></li>`;
    },
  ).join('');
}

const stage = document.querySelector('[data-mascot]');
if (stage) stage.innerHTML = mascot();

/**
 * Put text on the clipboard. The modern way first; where a page is not allowed to use
 * it — an embedded frame, an older browser — the old way through a hidden field, which
 * needs the click we are already inside of. Returns whether it worked, because a button
 * that says "copied" without copying is the worst of both.
 */
async function write(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.append(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
}

/** Nothing worked: at least leave the text selected, so one shortcut finishes the job. */
function select(pre: Element): void {
  const range = document.createRange();
  range.selectNodeContents(pre);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * A copy button on every snippet. The page shows commands people are meant to run, and
 * selecting eight lines of shell by hand is the kind of small friction a landing page
 * has no excuse for.
 */
for (const code of document.querySelectorAll<HTMLElement>('figure.code')) {
  const pre = code.querySelector('pre');
  if (!pre) continue;
  const button = document.createElement('button');
  button.className = 'copy';
  button.type = 'button';
  button.textContent = 'copy';
  button.addEventListener('click', async () => {
    const text = (pre.textContent ?? '').replace(/^\$ /gm, '').trim();
    const done = (await write(text)) ? 'copied' : 'press ⌘C';
    if (done === 'press ⌘C') select(pre);
    button.textContent = done;
    button.classList.toggle('is-done', done === 'copied');
    setTimeout(() => {
      button.textContent = 'copy';
      button.classList.remove('is-done');
    }, 1600);
  });
  code.append(button);
}

const host = document.querySelector<HTMLElement>('[data-ide]');
const state = document.querySelector<HTMLElement>('[data-demo-state]');

async function start(root: HTMLElement): Promise<Core> {
  const snapshot = (await (await fetch('/demo/daemon.json')).json()) as Snapshot;
  const { dial } = demoDial(snapshot);
  return mount(root, { dial });
}

if (host) {
  start(host).then(
    (ide) => {
      if (state) state.textContent = 'live';
      for (const button of document.querySelectorAll<HTMLButtonElement>('[data-run]')) {
        button.addEventListener('click', () => {
          host.focus({ preventScroll: true });
          ide.commands.run(button.dataset.run!);
        });
      }
      (window as unknown as { ide: Core }).ide = ide;
    },
    (err: unknown) => {
      if (state) state.textContent = 'could not start';
      host.textContent = `The demo did not start: ${err instanceof Error ? err.message : String(err)}`;
    },
  );
}
