import fs from 'node:fs/promises';
import path from 'node:path';
import type http from 'node:http';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

/**
 * The built client, served by the daemon from its own port.
 *
 * An installed IDE is one process and one address: the page and its socket come from
 * the same origin, so the client finds the daemon by `location` and nothing has to be
 * configured. Unknown paths get `index.html` — the address carries the project (`?ws=`),
 * not a route. Nothing outside the directory is ever read.
 */
export class StaticFiles {
  constructor(private readonly root: string) {}

  async serve(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const url = new URL(req.url ?? '/', 'http://localhost');
    const wanted = path.resolve(this.root, '.' + decodeURIComponent(url.pathname));
    if (wanted !== this.root && !wanted.startsWith(this.root + path.sep)) return false;
    const file = (await this.isFile(wanted)) ? wanted : path.join(this.root, 'index.html');
    let body: Buffer;
    try {
      body = await fs.readFile(file);
    } catch {
      return false;
    }
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  private async isFile(at: string): Promise<boolean> {
    try {
      return (await fs.stat(at)).isFile();
    } catch {
      return false;
    }
  }
}
