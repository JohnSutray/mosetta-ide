import { Core } from './core.js';
import type { Dial } from './rpc/client.js';
import './ide.css';

export type { Dial } from './rpc/client.js';
export type { Core } from './core.js';

export interface EmbedOptions {
  /**
   * Opens the connection to the daemon. By default a socket to the local daemon on its
   * usual port; anything shaped like a `WebSocket` will do.
   */
  dial?: Dial;
}

/**
 * Put the IDE into an element of somebody else's page.
 *
 * The element decides the size: give it one. The IDE listens for keys and pointer
 * events on the element rather than on the window, leaves the page's title and address
 * alone, and keeps its styles under the element's `mosetta-ide` class.
 */
export function mount(root: HTMLElement, options: EmbedOptions = {}): Core {
  const core = new Core(root, { page: false, ...options });
  core.start();
  return core;
}
