import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginHost } from './plugins/host.js';
import { FindProviders, type FindProvider } from './search/providers.js';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, WS_PATH } from '@ide/protocol';
import { ConfigStore } from './config/store.js';
import { recent } from './env/recent.js';
import { logger } from './log.js';
import { Session } from './rpc/session.js';
import { WorkspaceRegistry } from './workspace/registry.js';

const log = logger('server');

export interface ServerOptions {
  port?: number;
  host?: string;
  idleMs?: number;
  configDir?: string;
  stateDir?: string;
  watchConfig?: boolean;
  finds?: FindProvider[];
}

export interface RunningServer {
  port: number;
  registry: WorkspaceRegistry;
  config: ConfigStore;
  close(): Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? DEFAULT_PORT;
  const startedAt = Date.now();
  const stateDir = options.stateDir ?? recent.DEFAULT_STATE_DIR;
  const config = await ConfigStore.load(options.configDir);
  if (options.watchConfig ?? true) config.watch();
  const plugins = new PluginHost(log, path.join(stateDir, 'plugins-build'));
  await plugins.load(config.settings.plugins.enabled, fileURLToPath(new URL('..', import.meta.url)));

  const finds = new FindProviders();
  for (const provider of [...plugins.finds(), ...(options.finds ?? [])]) finds.add(provider);

  const registry = new WorkspaceRegistry(config, finds, { idleMs: options.idleMs });

  const http_ = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, uptimeMs: Date.now() - startedAt }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });

  http_.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    if (url.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    if (!isLocalOrigin(req.headers.origin)) {
      log.warn(`отказ по Origin: ${req.headers.origin}`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const session = new Session(ws, registry, config, stateDir, startedAt, plugins);
      log.debug(`подключилась вкладка ${session.id}`);
    });
  });

  await new Promise<void>((resolve, reject) => {
    http_.once('error', reject);
    http_.listen(port, host, () => {
      http_.off('error', reject);
      resolve();
    });
  });

  const actual = (http_.address() as { port: number }).port;
  log.info(`слушает ws://${host}:${actual}${WS_PATH}`);

  return {
    port: actual,
    registry,
    config,
    async close() {
      config.dispose();
      await registry.closeAll();
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise<void>((resolve) => http_.close(() => resolve()));
    },
  };
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
