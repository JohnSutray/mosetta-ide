import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export class DesktopPaths {
  readonly home = path.join(os.homedir(), '.mosetta', 'ide');
  readonly config = path.join(this.home, 'config');
  readonly state = path.join(this.home, 'state');
  readonly logs = path.join(this.home, 'logs');

  constructor(readonly repo: string) {}

  get build(): string {
    return path.join(this.repo, 'desktop', '.build');
  }

  get client(): string {
    return path.join(this.build, 'client');
  }

  get server(): string {
    return path.join(this.repo, 'server');
  }

  get assets(): string {
    return path.join(this.repo, 'desktop', 'assets');
  }

  seedConfig(): string[] {
    fs.mkdirSync(this.config, { recursive: true });
    const seeded: string[] = [];
    for (const name of ['keymap.json', 'settings.json']) {
      const target = path.join(this.config, name);
      if (fs.existsSync(target)) continue;
      fs.copyFileSync(path.join(this.repo, 'config', name), target);
      seeded.push(name);
    }
    return seeded;
  }
}
