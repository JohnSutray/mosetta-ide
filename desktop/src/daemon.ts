import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DaemonOptions {
  /** The server's directory: its `tsx` and its `src/main.ts` are there. */
  serverDir: string;
  configDir: string;
  logsDir: string;
  /** The Origin of the shell's pages: the server is to let it in. */
  trustedOrigin: string;
}

/**
 * The daemon is the IDE's server as a child process.
 *
 * A separate process rather than Electron's main one: close every window and the
 * terminals and language servers live on; if the server falls over the windows do not,
 * and the supervisor brings it back up on the same port while the tabs reconnect by
 * themselves. We start it with Electron's binary in Node mode (`ELECTRON_RUN_AS_NODE`):
 * a second Node on the machine is not needed, and `node-pty` is built on N-API and
 * loads with no rebuild.
 */
export class Daemon {
  private child: ChildProcess | null = null;
  private port = 0;
  private stopping = false;
  private readonly crashes: number[] = [];
  private waiting: Array<(port: number) => void> = [];
  private readonly log: fs.WriteStream;

  constructor(private readonly options: DaemonOptions) {
    fs.mkdirSync(options.logsDir, { recursive: true });
    this.log = fs.createWriteStream(path.join(options.logsDir, 'daemon.log'), { flags: 'a' });
  }

  /** The port the server listens on — once it has named it. */
  ready(): Promise<number> {
    if (this.port && this.child) return Promise.resolve(this.port);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  start(): void {
    const { serverDir, configDir, trustedOrigin } = this.options;
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/main.ts'], {
      cwd: serverDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        IDE_PORT: String(this.port),
        IDE_CONFIG_DIR: configDir,
        IDE_TRUSTED_ORIGINS: trustedOrigin,
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;
    child.stdout?.on('data', (chunk: Buffer) => this.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.write(chunk));
    child.on('message', (message: { type?: string; port?: number }) => {
      if (message?.type !== 'listening' || !message.port) return;
      this.port = message.port;
      for (const resolve of this.waiting.splice(0)) resolve(this.port);
    });
    child.on('exit', (code, signal) => {
      this.child = null;
      this.write(`[daemon] the server exited: ${signal ?? code}\n`);
      if (this.stopping) return;
      this.restart();
    });
  }

  /** Put the server out and wait: the terminals and language servers are its children. */
  stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise((resolve) => {
      const hard = setTimeout(() => child.kill('SIGKILL'), 3000);
      child.once('exit', () => {
        clearTimeout(hard);
        resolve();
      });
      child.kill('SIGTERM');
    });
  }

  /**
   * Bring it back up, but not for ever: five falls in a minute is not a glitch but a
   * breakage, and spinning it round in circles means hiding it. Then we say so in the
   * log and keep quiet.
   */
  private restart(): void {
    const now = Date.now();
    this.crashes.push(now);
    while (this.crashes.length && now - this.crashes[0]! > 60_000) this.crashes.shift();
    if (this.crashes.length > 5) {
      this.write('[daemon] five falls in a minute — bringing it up no more, see daemon.log\n');
      return;
    }
    setTimeout(() => this.start(), 500 * this.crashes.length);
  }

  private write(chunk: Buffer | string): void {
    this.log.write(chunk);
    process.stdout.write(chunk);
  }
}
