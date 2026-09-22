import { mount, type Core } from '@mosetta/ide-client/embed';
import { demoDial } from './demo/socket.js';
import type { DemoDaemon, Snapshot } from './demo/daemon.js';

/**
 * The IDE full-screen, against the same daemon made of memory as the landing page. The
 * pair is left on `window.demo` so that the scripts recording the screenshots can set a
 * scene up the way a person would, through commands.
 */
const root = document.getElementById('ide')!;
const snapshot = (await (await fetch('/demo/daemon.json')).json()) as Snapshot;
const { dial, daemon } = demoDial(snapshot);
const ide = mount(root, { dial });
(window as unknown as { demo: { ide: Core; daemon: DemoDaemon } }).demo = { ide, daemon };
