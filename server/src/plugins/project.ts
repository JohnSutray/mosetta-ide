import type { MemoryDoc, MemoryEvent, ProcessHandle, Project, ProjectMemory, ProjectResource, RunAsk } from '@mosetta/ide-api/server';
import { sectionOf } from '@mosetta/ide-api/section';
import type { Processes } from '../env/processes.js';
import type { Workspace } from '../workspace/workspace.js';

/**
 * A workspace shown to a plugin as a PROJECT.
 *
 * A thin overlay, and its whole job is in two `key` lines: resource keys and event
 * names are partitioned BY PLUGIN. Without that, two plugins naming theirs `terminals`
 * alike would silently share one object, and a tab subscribed to `data` would hear
 * somebody else's.
 *
 * It lives among the plugin code rather than among the workspace code: this is
 * knowledge about the plugin system rather than about how a project is built. The
 * workspace knows nothing about it and should not — otherwise the core starts
 * understanding what a plugin is again.
 */
export class PluginProject implements Project {
  /**
   * The memory layer, lent to a plugin. An overlay rather than the real thing: what
   * goes outwards is a subset of the events and three ways of reading, with nothing to
   * write with. The one place where a plugin touches a project's data — and it is
   * named.
   */
  readonly memory: ProjectMemory;

  constructor(
    private readonly ws: Workspace,
    /** The plugin package's name: also the namespace of its keys and its events. */
    private readonly plugin: string,
    /** The server's process ledger: a project's long-lived processes go into it. */
    private readonly processes: Pick<Processes, 'adopt' | 'start'>,
  ) {
    const ram = ws.services.ram;
    const lend = (
      doc: { path: string; text: string; version: number; openCount: number; savedText?: string } | undefined,
    ): MemoryDoc | null =>
      doc
        ? {
            path: doc.path,
            text: doc.text,
            version: doc.version,
            openCount: doc.openCount,
            ...(doc.savedText !== undefined ? { savedText: doc.savedText } : {}),
          }
        : null;
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
      disk: async (path) => {
        const os = ws.services.os;
        const stat = await os.stat(path);
        if (!stat || stat.kind !== 'file') return null;
        const file = await os.read(path);
        return { text: file.text, revision: file.revision };
      },
      settle: (path, text) => ram.resolveDoc(path, text),
      adopt: (path, text) => ram.adoptDoc(path, text),
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

  /** This project's effective settings: the machine's plus its own `.mosetta` file. */
  settings<T extends object>(section: string, defaults: T): T {
    return sectionOf(this.ws.settings, section, defaults);
  }

  spawned(
    info: { pid: number | undefined; command: string; reason: string },
    kill: () => void,
  ): () => void {
    return this.processes.adopt({ ...info, owner: this.ws.root }, kill);
  }

  start(ask: RunAsk): ProcessHandle {
    const handle = this.processes.start({
      ...ask,
      cwd: ask.cwd ?? this.ws.root,
      owner: this.ws.root,
      reason: `${this.plugin}: ${ask.reason}`,
    });
    return {
      child: handle.child,
      kill: (signal) => handle.kill(signal as NodeJS.Signals | undefined),
      memoryMb: () => handle.memoryMb(),
    };
  }
}

/**
 * Which of the memory layer's events go outwards. The rest is a conversation with the
 * editor.
 */
function asMemoryEvent(event: { type: string; path: string; from?: string }): MemoryEvent | null {
  switch (event.type) {
    case 'doc.resident':
    case 'doc.opened':
    case 'doc.changed':
    case 'doc.saved':
    case 'doc.external':
    case 'doc.closed':
    case 'doc.removed':
    case 'doc.saveBlocked':
    case 'tree.changed':
      return { type: event.type, path: event.path };
    case 'doc.moved':
      return { type: 'doc.moved', path: event.path, from: event.from ?? '' };
    default:
      return null;
  }
}
