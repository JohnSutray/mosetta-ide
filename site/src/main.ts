import { mount, type Core } from '@mosetta/ide-client/embed';
import { demoDial } from './demo/socket.js';
import type { Snapshot } from './demo/daemon.js';
import { PLUGINS } from './plugins.js';
import './landing.css';

/**
 * Where the source lives; one constant, so the links move together. `null` until the
 * repository is public: a link to nowhere is worse than no link.
 */
const REPO: string | null = 'https://github.com/JohnSutray/mosetta-ide';

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
