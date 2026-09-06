import type { MemoryDoc, MemoryEvent, ProcessHandle, Project, ProjectMemory, ProjectResource, RunAsk } from '@ide/api/server';
import { processes } from '../env/processes.js';
import type { Workspace } from '../workspace/workspace.js';

export class PluginProject implements Project {
  readonly memory: ProjectMemory;

  constructor(
    private readonly ws: Workspace,
    private readonly plugin: string,
  ) {
    const ram = ws.services.ram;
    const lend = (doc: { path: string; text: string; version: number; openCount: number } | undefined): MemoryDoc | null =>
      doc ? { path: doc.path, text: doc.text, version: doc.version, openCount: doc.openCount } : null;
    this.memory = {
      on: (listener) =>
        ram.on((event) => {
          const shared = asMemoryEvent(event);
          if (shared) listener(shared);
        }),
      files: () => ram.files(),
      docSync: (path) => lend(ram.docSync(path)),
      peekDoc: async (path) => lend(await ram.peekDoc(path)) as MemoryDoc,
      isTextual: (path) => ram.isTextual(path),
    };
  }

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

  start(ask: RunAsk): ProcessHandle {
    const handle = processes.start({
      ...ask,
      cwd: ask.cwd ?? this.ws.root,
      owner: this.ws.root,
      reason: `${this.plugin}: ${ask.reason}`,
    });
    return { child: handle.child, kill: (signal) => handle.kill(signal as NodeJS.Signals | undefined) };
  }
}

function asMemoryEvent(event: { type: string; path: string; from?: string }): MemoryEvent | null {
  switch (event.type) {
    case 'doc.resident':
    case 'doc.opened':
    case 'doc.changed':
    case 'doc.saved':
    case 'doc.external':
    case 'doc.closed':
    case 'doc.removed':
    case 'tree.changed':
      return { type: event.type, path: event.path };
    case 'doc.moved':
      return { type: 'doc.moved', path: event.path, from: event.from ?? '' };
    default:
      return null;
  }
}
