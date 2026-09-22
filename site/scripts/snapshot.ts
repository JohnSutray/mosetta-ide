import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '@mosetta/ide-server/src/server.js';
import { WS_PATH } from '@mosetta/ide-protocol';

/**
 * What the demo daemon cannot make up: the plugins, built by the real server exactly
 * the way it builds them for a tab, and the factory configuration. The server comes up
 * on an empty config directory and a scratch state directory, so nothing from this
 * machine's own settings ends up on the website.
 */
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'demo');
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'mosetta-site-'));
const server = await boot.start({
  port: 0,
  configDir: path.join(scratch, 'config'),
  stateDir: path.join(scratch, 'state'),
  watchConfig: false,
  shellEnv: false,
});

const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve);
  socket.addEventListener('error', reject);
});

let next = 1;
const pending = new Map<number, (frame: { result?: unknown; error?: { message: string } }) => void>();
socket.addEventListener('message', (event) => {
  const frame = JSON.parse(String(event.data));
  if (typeof frame.id === 'number') pending.get(frame.id)?.(frame);
});

function call<T>(method: string, params: unknown): Promise<T> {
  const id = next++;
  socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, (frame) => (frame.error ? reject(new Error(`${method}: ${frame.error.message}`)) : resolve(frame.result as T)));
  });
}

const config = await call<unknown>('config.get', null);
const list = await call<Array<{ name: string; hasClient: boolean; state: string; error?: string }>>('plugins.list', null);
const broken = list.filter((one) => one.state !== 'ok');
if (broken.length > 0) throw new Error(`plugins that did not build: ${broken.map((one) => `${one.name} (${one.error})`).join(', ')}`);

const code: Record<string, string> = {};
for (const one of list) {
  if (!one.hasClient) continue;
  code[one.name] = (await call<{ code: string }>('plugins.code', { name: one.name })).code.replace(
    /\n\/\/# sourceMappingURL=data:[^\n]*\n?$/,
    '\n',
  );
}

await fs.mkdir(out, { recursive: true });
await fs.writeFile(path.join(out, 'daemon.json'), JSON.stringify({ config, plugins: list, code }));
socket.close();
await server.close();
await fs.rm(scratch, { recursive: true, force: true });
const size = (await fs.stat(path.join(out, 'daemon.json'))).size;
console.log(`snapshot: ${list.length} plugins, ${Math.round(size / 1024)} KB`);
