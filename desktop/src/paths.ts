import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

export class DesktopPaths {
  readonly home = path.join(os.homedir(), '.mosetta', 'ide');
  readonly config = path.join(this.home, 'config');
  readonly state = path.join(this.home, 'state');
  readonly logs = path.join(this.home, 'logs');
  private readonly require: ReturnType<typeof createRequire>;

  constructor(readonly pkg: string) {
    this.require = createRequire(path.join(pkg, 'package.json'));
  }

  get build(): string {
    return path.join(this.pkg, '.build');
  }

  get client(): string {
    return path.join(this.build, 'client');
  }

  get assets(): string {
    return path.join(this.pkg, 'assets');
  }

  get server(): string {
    return path.dirname(this.require.resolve('@mosetta/ide-server/package.json'));
  }

  seedConfig(): string[] {
    fs.mkdirSync(this.config, { recursive: true });
    const from = path.join(this.pkg, '..', 'config', 'settings.json');
    const target = path.join(this.config, 'settings.json');
    if (fs.existsSync(target) || !fs.existsSync(from)) return [];
    fs.copyFileSync(from, target);
    return ['settings.json'];
  }
}
