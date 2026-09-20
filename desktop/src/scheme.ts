import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * A scheme of our own for the shell's pages: `mosetta://app/…`.
 *
 * `file://` will not do, for two reasons: the server only lets a socket in from a local
 * Origin, and `file://` has none at all; and vite's module build scripts do not load
 * over `file://`. A scheme of our own is standard and privileged, with an Origin of its
 * own: that is what the server lets it in by.
 */
export class AppScheme {
  readonly scheme = 'mosetta';
  readonly host = 'app';

  /** `root` is the client built on this machine. We hand out that and nothing else. */
  constructor(private readonly root: string) {}

  get origin(): string {
    return `${this.scheme}://${this.host}`;
  }

  /** Before the application is ready — otherwise Electron will not accept the scheme. */
  register(): void {
    protocol.registerSchemesAsPrivileged([
      { scheme: this.scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
    ]);
  }

  serve(): void {
    protocol.handle(this.scheme, (request) => {
      const url = new URL(request.url);
      if (url.host !== this.host) return new Response('not found', { status: 404 });
      const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const file = path.normalize(path.join(this.root, rel));
      if (!file.startsWith(this.root + path.sep)) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(file).toString());
    });
  }

  /**
   * The daemon's port goes into the page's address: the client is built with
   * `VITE_IDE_PORT=url`.
   */
  url(port: number): string {
    return `${this.origin}/index.html?port=${port}`;
  }
}
