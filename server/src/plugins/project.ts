import type { Project, ProjectResource } from '@ide/api/server';
import { processes } from '../env/processes.js';
import type { Workspace } from '../workspace/workspace.js';

export class PluginProject implements Project {
  constructor(
    private readonly ws: Workspace,
    private readonly plugin: string,
  ) {}

  get root(): string {
    return this.ws.root;
  }

  get name(): string {
    return this.ws.name;
  }

  use<T extends ProjectResource>(key: string, create: () => T): T {
    return this.ws.use(`plugin:${this.plugin}:${key}`, () => create());
  }

  emit(event: string, payload: unknown): void {
    this.ws.broadcast('plugins.event', { name: this.plugin, event, payload });
  }

  hold(reason: string): () => void {
    return this.ws.hold(`${this.plugin}: ${reason}`);
  }

  resolve(relative: string): string {
    return this.ws.resolve(relative);
  }

  spawned(
    info: { pid: number | undefined; command: string; reason: string },
    kill: () => void,
  ): () => void {
    return processes.adopt({ ...info, owner: this.ws.root }, kill);
  }
}
