import { net, protocol } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export class AppScheme {
  readonly scheme = 'mosetta';
  readonly host = 'app';

  constructor(private readonly root: string) {}

  get origin(): string {
    return `${this.scheme}://${this.host}`;
  }

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

  url(port: number): string {
    return `${this.origin}/index.html?port=${port}`;
  }
}
