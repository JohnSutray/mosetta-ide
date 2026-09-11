import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SharedModules } from './plugins/shared.js';
import { PluginHost } from './plugins/host.js';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, WS_PATH } from '@mosetta/ide-protocol';
import { ConfigStore } from './config/store.js';
import { Env } from './env/env.js';
import { journal } from './log.js';
import { Session } from './rpc/session.js';
import { WorkspaceRegistry } from './workspace/registry.js';
import { disk } from './fs/os-fs.js';

const log = journal.logger('server');

export interface ServerOptions {
  port?: number;
  host?: string;
  idleMs?: number;
  configDir?: string;
  stateDir?: string;
  watchConfig?: boolean;
  shellEnv?: boolean;
  trustedOrigins?: string[];
}

export interface RunningServer {
  port: number;
  registry: WorkspaceRegistry;
  config: ConfigStore;
  close(): Promise<void>;
}

function isLocalOrigin(origin: string | undefined, trusted: readonly string[] = []): boolean {
  if (!origin) return true;
  if (trusted.includes(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

export class Boot {
  private async defaultStateDir(): Promise<string> {
    const next = path.join(os.homedir(), '.mosetta', 'ide', 'state');
    if (await disk.moveOnce(path.join(os.homedir(), '.web-ide'), next)) {
      log.info(`состояние перенесено: ~/.web-ide → ${next}`);
    }
    return next;
  }

  async start(options: ServerOptions = {}): Promise<RunningServer> {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? DEFAULT_PORT;
    const startedAt = Date.now();
    const stateDir = options.stateDir ?? (await this.defaultStateDir());
    const config = await ConfigStore.load(options.configDir);
    const env = new Env();
    if (options.watchConfig ?? true) config.watch();

    if (options.shellEnv ?? true) {
      void env.shellEnv.prime((spec) => env.processes.run(spec), env.shellEnv.loginShell(), os.homedir());
    }
    const here = fileURLToPath(new URL('..', import.meta.url));
    const client = path.dirname(createRequire(import.meta.url).resolve('@mosetta/ide-client/package.json'));
    const shared = new SharedModules(here, client);
    const plugins = new PluginHost(log, stateDir, shared, {
      settings: () => config.settings,
      environment: () => env.shellEnv.current ?? {},
      which: (name) => env.which.onPath(name),
      processes: env.processes,
    });
    await plugins.load(config.settings.plugins.enabled);

    const registry = new WorkspaceRegistry(config, env.processes, { idleMs: options.idleMs });
    registry.onOpen((ws) => plugins.projectOpened(ws));

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
      if (!isLocalOrigin(req.headers.origin, options.trustedOrigins)) {
        log.warn(`отказ по Origin: ${req.headers.origin}`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const session = new Session(ws, registry, config, startedAt, plugins);
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
}

export const boot = new Boot();
