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
  /** How long a workspace lives without a single tab. */
  idleMs?: number;
  /**
   * Where to read the settings file from. By default, the `config` directory next to
   * the packages; `IDE_CONFIG_DIR` overrides it.
   */
  configDir?: string;
  /** Where to keep the machine's state (the project history). */
  stateDir?: string;
  /** Watch the config and re-read it on the fly. Not needed in tests. */
  watchConfig?: boolean;
  /**
   * Ask the human's shell for its environment.
   *
   * Not needed in tests: it is an extra 0.3 s per server brought up, and it is covered
   * by its own tests, where the shell is substituted.
   */
  shellEnv?: boolean;
  /**
   * Origins allowed to open a socket besides the local ones: the Electron shell's pages
   * live on their own `mosetta://app` scheme.
   */
  trustedOrigins?: string[];
}

export interface RunningServer {
  port: number;
  registry: WorkspaceRegistry;
  config: ConfigStore;
  close(): Promise<void>;
}

/** An empty Origin is not a browser (curl, tests, Electron). */
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

/**
 * Bringing the backend up. A class rather than a function: the start has parameters
 * that will one day become fields — the port, the state directory, the set of
 * suppliers.
 */
export class Boot {
  /**
   * The default state directory: `~/.mosetta/ide/state`, next to an installed IDE's
   * config. It used to be `~/.web-ide`; its contents (the project history, the plugins'
   * state) move over whole, once.
   */
  private async defaultStateDir(): Promise<string> {
    const next = path.join(os.homedir(), '.mosetta', 'ide', 'state');
    if (await disk.moveOnce(path.join(os.homedir(), '.web-ide'), next)) {
      log.info(`state moved over: ~/.web-ide → ${next}`);
    }
    return next;
  }

  /**
   * The backend listens on the loopback only. While this is a personal editor on one's
   * own machine that is enough; opening it outwards without authentication is not on —
   * `fs.write` in somebody else's hands is somebody else's hands in the filesystem.
   */
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
        log.warn(`refused by Origin: ${req.headers.origin}`);
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        const session = new Session(ws, registry, config, startedAt, plugins, env.memory);
        log.debug(`a tab connected: ${session.id}`);
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
    log.info(`listening on ws://${host}:${actual}${WS_PATH}`);

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

/** One per process. */
export const boot = new Boot();
