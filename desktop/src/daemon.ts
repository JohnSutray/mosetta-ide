import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface DaemonOptions {
  serverDir: string;
  configDir: string;
  logsDir: string;
  trustedOrigin: string;
}

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
      this.write(`[daemon] сервер вышел: ${signal ?? code}\n`);
      if (this.stopping) return;
      this.restart();
    });
  }

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

  private restart(): void {
    const now = Date.now();
    this.crashes.push(now);
    while (this.crashes.length && now - this.crashes[0]! > 60_000) this.crashes.shift();
    if (this.crashes.length > 5) {
      this.write('[daemon] пять падений за минуту — больше не поднимаю, смотри daemon.log\n');
      return;
    }
    setTimeout(() => this.start(), 500 * this.crashes.length);
  }

  private write(chunk: Buffer | string): void {
    this.log.write(chunk);
    process.stdout.write(chunk);
  }
}
