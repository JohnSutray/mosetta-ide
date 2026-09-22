import Ajv, { type ValidateFunction } from 'ajv';
import { signal, type Signal } from '@preact/signals';
import type {
  DirEntry,
  DocState,
  DocVersion,
  Settings,
  WorkspaceInfo,
  SettingScope,
  SettingValue,
} from '@mosetta/ide-protocol';
import { attach, commandsOf, hooksOf, passportOf, registriesOf, sectionsOf } from './client.js';
import { sectionOf } from './section.js';
import type {
  IdeServices,
  Mount,
  Note,
  NoteKind,
  NotesAccess,
  DocWire,
  FsAccess,
  TreeWire,
  WorkspacesAccess,
  Ide,
  PluginClass,
  RegistryHandle,
} from './client.js';

export {
  activate,
  command,
  configSection,
  IdeProvider,
  plugin,
  PROJECT_LAYER,
  registry,
  remote,
  inLayerOrder,
  settingsKey,
  stub,
  useIde,
  USER_LAYER,
  useT,
} from './client.js';

/** What the plugin asked to show a human. */
export interface Tip {
  text: string;
  keys: string[];
}

/**
 * A fake wire to the document layer.
 *
 * The "server" answers with whatever the test put into `texts`, and everything that was
 * asked for is recorded in order. Events are fired by the test — which is how the
 * document plugin is checked without a socket, and its neighbours without the plugin
 * itself.
 */
export class FakeDocWire implements DocWire {
  /** The files' text "in the server's memory": the test puts it there. */
  readonly texts = new Map<string, string>();
  readonly opened: string[] = [];
  readonly closed: string[] = [];
  readonly edits: Array<{ path: string; text: string }> = [];
  readonly saved: string[] = [];
  readonly reloaded: string[] = [];
  /**
   * What is "unsaved" in the server's memory: an edit adds to this, `save` removes. The
   * test may add a path by hand — a dirty document lives on without an open tab.
   */
  readonly unsavedPaths = new Set<string>();
  /** How to answer a `save`. By default, by saving. */
  saveFails: { code: number; message: string } | null = null;
  /** Sending an edit answers with an error: another tab moved ahead. */
  editFails: { code: number; message: string } | null = null;
  private version = 1;
  private readonly changed = new Set<(event: DocVersion) => void>();
  private readonly external = new Set<(event: { path: string; revision: string }) => void>();
  private readonly diverged = new Set<(event: { path: string; reason: 'changed' | 'removed' }) => void>();
  private readonly moved = new Set<(event: { from: string; path: string }) => void>();
  private readonly removed = new Set<(event: { path: string }) => void>();

  private stateOf(path: string): DocState {
    const text = this.texts.get(path);
    if (text === undefined) throw new Error(`no such file: ${path}`);
    return { path, text, version: this.version, revision: 'r1', dirty: false, truncated: false };
  }
  async open(path: string): Promise<DocState> {
    this.opened.push(path);
    return this.stateOf(path);
  }
  async close(path: string): Promise<void> {
    this.closed.push(path);
  }
  async edit(path: string, text: string, _baseVersion: number): Promise<DocVersion> {
    if (this.editFails) throw Object.assign(new Error(this.editFails.message), { code: this.editFails.code });
    this.edits.push({ path, text });
    this.texts.set(path, text);
    this.unsavedPaths.add(path);
    this.version += 1;
    return { path, version: this.version, dirty: true };
  }
  async save(path: string): Promise<DocState> {
    if (this.saveFails) throw Object.assign(new Error(this.saveFails.message), { code: this.saveFails.code });
    this.saved.push(path);
    this.unsavedPaths.delete(path);
    return this.stateOf(path);
  }
  async reload(path: string): Promise<DocState> {
    this.reloaded.push(path);
    return this.stateOf(path);
  }
  async state(path: string): Promise<DocState> {
    return this.stateOf(path);
  }
  async unsaved(): Promise<string[]> {
    return [...this.unsavedPaths].sort();
  }
  onChanged(handler: (event: DocVersion) => void): () => void {
    this.changed.add(handler);
    return () => this.changed.delete(handler);
  }
  onExternal(handler: (event: { path: string; revision: string }) => void): () => void {
    this.external.add(handler);
    return () => this.external.delete(handler);
  }
  onDiverged(handler: (event: { path: string; reason: 'changed' | 'removed' }) => void): () => void {
    this.diverged.add(handler);
    return () => this.diverged.delete(handler);
  }
  onMoved(handler: (event: { from: string; path: string }) => void): () => void {
    this.moved.add(handler);
    return () => this.moved.delete(handler);
  }
  onRemoved(handler: (event: { path: string }) => void): () => void {
    this.removed.add(handler);
    return () => this.removed.delete(handler);
  }
  /** The server said so. */
  fireChanged(event: DocVersion): void {
    for (const handler of this.changed) handler(event);
  }
  fireExternal(event: { path: string; revision: string }): void {
    for (const handler of this.external) handler(event);
  }
  fireDiverged(event: { path: string; reason: 'changed' | 'removed' }): void {
    for (const handler of this.diverged) handler(event);
  }
  fireMoved(event: { from: string; path: string }): void {
    for (const handler of this.moved) handler(event);
  }
  fireRemoved(event: { path: string }): void {
    for (const handler of this.removed) handler(event);
  }
}

/** The core's notes in a test: the same list, without timers. */
export class FakeNotes implements NotesAccess {
  readonly all = signal<Note[]>([]);
  private nextId = 1;
  notify(text: string, kind: NoteKind = 'info'): number {
    const id = this.nextId++;
    this.all.value = [...this.all.value, { id, kind, text, at: 0 }];
    return id;
  }
  settle(id: number, text: string, kind: NoteKind = 'info'): number {
    const at = this.all.value.findIndex((note) => note.id === id);
    if (at === -1) return this.notify(text, kind);
    const next = [...this.all.value];
    next[at] = { ...next[at]!, text, kind };
    this.all.value = next;
    return id;
  }
  dismiss(id: number): void {
    this.all.value = this.all.value.filter((note) => note.id !== id);
  }
  dismissAll(): void {
    this.all.value = [];
  }
}

/**
 * A fake application surface: the core services.
 *
 * `implements IdeServices` is not for show: when the contract grows, this class stops
 * compiling, and the harness follows it there and then rather than in six months.
 */
export class FakeSurface implements IdeServices {
  readonly settings: Signal<Settings | null> = signal(null);
  readonly settingsOf = <T extends object>(section: string, defaults: T): { readonly value: T } => {
    const all = this.settings;
    return {
      get value() {
        return sectionOf(all.value, section, defaults);
      },
    };
  };

  /**
   * Whether there is anywhere to write project-scoped settings. A project is open by
   * default.
   */
  readonly projectPath: Signal<string | null> = signal('/tmp/stand/.mosetta/settings.json');
  /** Which settings were asked to be reset to factory. */
  readonly settingResets: Array<{ section: string; key: string }> = [];
  readonly resetSetting = async (section: string, key: string): Promise<void> => {
    this.settingResets.push({ section, key });
  };

  /** What was asked to be written into the tab's title. */
  readonly titles: string[] = [];
  /** Where the stand is mounted: 1280×720 in the viewport's corner, no events. */
  readonly mount: Mount = {
    size: signal({ w: 1280, h: 720 }),
    bounds: () => ({ left: 0, top: 0, right: 1280, bottom: 720 }),
    local: (x, y) => ({ x, y }),
    idle: (el) => el === null,
    listen: () => () => {},
    title: (text) => {
      this.titles.push(text);
    },
    reveal: (el) => {
      if (el) this.revealed.push(el);
    },
  };

  /** What was asked to be scrolled into view, in order. */
  readonly revealed: Element[] = [];

  /** The tip on screen right now. */
  tip: Tip | null = null;
  /** Whether the socket to the server is alive: the test sets it. */
  readonly connected: Signal<boolean> = signal(true);
  /** What the daemon said about itself. By default, nobody has asked yet. */
  readonly daemon: Signal<{ rssMb: number; kidsMb: number | null } | null> = signal(null);
  /** The core's voice: notes without timers, as in the application. */
  readonly notes = new FakeNotes();

  /** The tab's project. The test opens and closes it itself. */
  readonly project: Signal<WorkspaceInfo | null> = signal(null);
  /** Directories over the wire: the test puts their contents there. */
  readonly dirs = new Map<string, DirEntry[]>();
  /** Which directories the wire was asked about, in order. */
  readonly treeLoads: string[] = [];
  private readonly treeWatchers = new Set<(event: { path: string }) => void>();
  readonly tree: TreeWire = {
    list: async (path) => {
      this.treeLoads.push(path);
      return this.dirs.get(path) ?? [];
    },
    onChanged: (handler) => {
      this.treeWatchers.add(handler);
      return () => this.treeWatchers.delete(handler);
    },
  };
  /** The server said "the directory changed". */
  changeTree(path: string): void {
    for (const handler of this.treeWatchers) handler({ path });
  }
  /** What was asked of the files, in order. */
  readonly fsCalls: Array<{ op: string; args: unknown[] }> = [];
  /** The files' bytes as "disk hands them over": base64 by path. */
  readonly fileBytes = new Map<string, string>();
  readonly fs: FsAccess = {
    create: async (path, kind) => {
      this.fsCalls.push({ op: 'create', args: [path, kind] });
      return { path, name: path.split('/').pop() ?? path, kind } as DirEntry;
    },
    move: async (from, to) => {
      this.fsCalls.push({ op: 'move', args: [from, to] });
      return { path: to, name: to.split('/').pop() ?? to, kind: 'file' } as DirEntry;
    },
    copy: async (from, to) => {
      this.fsCalls.push({ op: 'copy', args: [from, to] });
      return { path: to, name: to.split('/').pop() ?? to, kind: 'file' } as DirEntry;
    },
    remove: async (path) => {
      this.fsCalls.push({ op: 'remove', args: [path] });
    },
    write: async (path, text) => {
      this.fsCalls.push({ op: 'write', args: [path, text] });
    },
    writeBytes: async (path, base64) => {
      this.fsCalls.push({ op: 'writeBytes', args: [path, base64] });
      return { path, name: path.split('/').pop() ?? path, kind: 'file' } as DirEntry;
    },
    bytes: async (path: string, limit?: number) => {
      this.fsCalls.push({ op: 'bytes', args: [path, String(limit ?? '')] });
      return { path, base64: this.fileBytes.get(path) ?? '', bytes: 0, truncated: false };
    },
    absolute: async (path) => `/absolutely/${path}`,
  };
  /** The wire to the document: what was asked and what the "server" answers. */
  readonly docs = new FakeDocWire();
  /** What was written into the settings. */
  readonly settingWrites: Array<{ section: string; key: string; value: SettingValue; scope?: SettingScope }> = [];
  /** Workspaces: what the tab has, what is alive, what was asked to be opened. */
  readonly workspaceCurrent: Signal<WorkspaceInfo | null> = signal(null);
  readonly workspaceLive: Signal<WorkspaceInfo[]> = signal([]);
  readonly workspaceCalls: Array<{ op: string; args: unknown[] }> = [];
  readonly workspaces: WorkspacesAccess = {
    current: this.workspaceCurrent,
    live: this.workspaceLive,
    open: async (root) => {
      this.workspaceCalls.push({ op: 'open', args: [root] });
    },
    switchTo: async (id) => {
      this.workspaceCalls.push({ op: 'switchTo', args: [id] });
    },
  };
  /** What the file looked like in the commit: the test supplies it. */
  readonly heads = new Map<string, string>();
  constructor(private readonly host: FakeHost) {}

  /**
   * A label is a KEY, and the key is what we return. A test compares keys rather than
   * English text: otherwise every dictionary edit would turn tests red.
   */
  readonly t = (key: string, params?: Record<string, string | number>): string => {
    if (!params) return key;
    const tail = Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return `${key}(${tail})`;
  };

  readonly runCommand = (id: string): boolean => this.host.run(id);
  /** The build's commands: the test puts in the ones it needs. */
  readonly knownCommands: Signal<Array<{ id: string }>> = signal([]);

  readonly setSetting = async (
    section: string,
    key: string,
    value: SettingValue,
    scope?: SettingScope,
  ): Promise<void> => {
    this.settingWrites.push({ section, key, value, ...(scope ? { scope } : {}) });
  };
}

/**
 * The harness's registry.
 *
 * It can do exactly the three things the real one can: declare a key with a schema, add
 * an entry, and hand back everything the key holds. Validation is real, by the same ajv
 * and with the same NAMED refusal — a plugin writing the wrong thing into somebody's
 * key has to be named in a test too.
 */
export class FakeRegistry {
  private readonly entries = new Map<string, Signal<Array<{ by: string; value: unknown }>>>();
  private readonly schemas = new Map<string, { by: string; validate: ValidateFunction }>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(private readonly complain: (message: string) => void) {}

  declare(key: string, by: string, schema?: object): void {
    if (this.schemas.has(key)) {
      this.complain(`registry key «${key}» is already declared by: ${this.schemas.get(key)!.by}`);
      return;
    }
    if (!schema) return;
    this.schemas.set(key, { by, validate: this.ajv.compile(schema) });
    const slot = this.slot(key);
    const kept = slot.peek().filter((entry) => this.check(key, entry.by, entry.value));
    if (kept.length !== slot.peek().length) slot.value = kept;
  }

  add<T>(key: string, value: T, by: string): () => void {
    const entry = { by, value };
    if (!this.check(key, by, value)) return () => undefined;
    const slot = this.slot(key);
    slot.value = [...slot.value, entry];
    return () => {
      slot.value = slot.value.filter((item) => item !== entry);
    };
  }

  all<T>(key: string): T[] {
    return this.slot(key).value.map((entry) => entry.value as T);
  }

  /** Entries with their authors: for settings, the author is the layer. */
  layers<T>(key: string): Array<{ by: string; value: T }> {
    return this.slot(key).value as Array<{ by: string; value: T }>;
  }

  /** Who wrote this: needed when a key holds entries from several authors. */
  authors(key: string): string[] {
    return this.slot(key).value.map((entry) => entry.by);
  }

  /** The declared keys: a test checks that the plugin declared what it promised. */
  declared(): string[] {
    return [...this.schemas.keys()].sort();
  }

  private slot(key: string): Signal<Array<{ by: string; value: unknown }>> {
    let found = this.entries.get(key);
    if (!found) {
      found = signal<Array<{ by: string; value: unknown }>>([]);
      this.entries.set(key, found);
    }
    return found;
  }

  private check(key: string, by: string, value: unknown): boolean {
    const schema = this.schemas.get(key);
    if (!schema || schema.validate(value)) return true;
    this.complain(`${by} writes an entry of the wrong shape into «${key}»: ${why(schema.validate)}`);
    return false;
  }
}

/**
 * The services a plugin receives through its constructor.
 *
 * Records everything it was asked for. Answering for the server is taught by the test
 * itself: `ide.answers.set('list', …)` — otherwise the call throws naming the method,
 * rather than with `undefined`.
 */
export class FakeIde implements Ide {
  readonly commands = new Map<string, () => void>();
  /** What the plugin asked to remember across reloads. */
  readonly remembered = new Map<string, Signal<unknown>>();
  readonly surfaces: Array<() => unknown> = [];
  readonly styles: string[] = [];
  readonly said: string[] = [];
  /** Complaints kept apart from messages: the note's colour is part of the meaning. */
  readonly complaints: string[] = [];
  /** What started, and how it ended. */
  readonly work: Array<{ started: string; done?: string; failed?: boolean }> = [];
  /** What went to the server: method and parameters, in order. */
  readonly calls: Array<{ method: string; params: unknown }> = [];
  /** How the server answers. The key is the method's name. */
  readonly answers = new Map<string, (params: unknown) => unknown>();
  /** What the plugin subscribed to: event name → live handlers. */
  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  readonly rpc = {
    call: async (method: string, params?: unknown): Promise<unknown> => {
      this.calls.push({ method, params });
      const answer = this.answers.get(method);
      if (!answer) throw new Error(`${this.name}: the server has nothing to answer «${method}»`);
      return answer(params);
    },
  };

  constructor(
    readonly name: string,
    private readonly host: FakeHost,
  ) {}

  get t() { return this.host.surface.t; }
  get runCommand() { return this.host.surface.runCommand; }
  get knownCommands() { return this.host.surface.knownCommands; }
  get settings() { return this.host.surface.settings; }
  get settingsOf() { return this.host.surface.settingsOf; }
  get setSetting() { return this.host.surface.setSetting; }
  get project() { return this.host.surface.project; }
  get workspaces() { return this.host.surface.workspaces; }
  get connected() { return this.host.surface.connected; }
  get daemon() { return this.host.surface.daemon; }
  get notes() { return this.host.surface.notes; }
  get tree() { return this.host.surface.tree; }
  get fs() { return this.host.surface.fs; }
  get docs() { return this.host.surface.docs; }
  get mount() { return this.host.surface.mount; }
  get projectPath() { return this.host.surface.projectPath; }
  get resetSetting() { return this.host.surface.resetSetting; }

  getPlugin<T>(ctor: PluginClass<T>): T {
    return this.host.plugin(ctor);
  }

  complain(message: string): void {
    this.complaints.push(message);
  }

  /** One line per slot: the last one is the one that stays. */
  readonly slots = new Map<string, string>();
  sayOnce(slot: string, message: string): void {
    this.slots.set(slot, message);
    this.said.push(message);
  }

  working(text: string): (done: string, failed?: boolean) => void {
    const entry: { started: string; done?: string; failed?: boolean } = { started: text };
    this.work.push(entry);
    return (done: string, failed = false) => {
      entry.done = done;
      entry.failed = failed;
    };
  }

  on(event: string, handler: (payload: unknown) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(handler);
    this.listeners.set(event, set);
    return () => set.delete(handler);
  }

  /**
   * Tell the plugin what its own server half would have told it.
   *
   * There is no server in the harness, so the event comes from here — exactly as
   * answers to calls come from `answers`. Without this, a test for a subscription would
   * have to be written with timers and a real socket.
   */
  emit(event: string, payload: unknown): void {
    for (const handler of [...(this.listeners.get(event) ?? [])]) handler(payload);
  }

  command(id: string, run: () => void): void {
    this.commands.set(id, run);
  }

  registry<T>(key: string): RegistryHandle<T> {
    const store = this.host.registry;
    const name = this.name;
    return {
      add: (value: T) => store.add(key, value, name),
      get all() {
        return { get value() { return store.all<T>(key); } };
      },
      get entries() {
        return { get value() { return store.layers<T>(key); } };
      },
    };
  }

  /**
   * The plugin's memory. Real in behaviour and fake in lifetime: it lives for one test
   * rather than for one tab. What was set up is visible in `remembered` — a test cares
   * about WHAT the plugin decided to remember, too.
   */
  remember<T>(key: string, initial: T, _scope?: 'tab' | 'both'): Signal<T> {
    const known = this.remembered.get(key);
    if (known) return known as Signal<T>;
    const made = signal(initial);
    this.remembered.set(key, made as Signal<unknown>);
    return made;
  }

  css(text: string): void {
    this.styles.push(text);
  }

  surface(view: () => unknown): void {
    this.surfaces.push(view);
  }

  say(message: string): void {
    this.said.push(message);
  }
}

/**
 * A fake host: it brings plugins up by the same ritual as the application.
 *
 * ```ts
 * const host = new FakeHost();
 * const toolbar = host.add(Toolbar, '@mosetta/ide-plugin-toolbar');
 * await host.start();
 * ```
 *
 * There is one difference from the application, and it is deliberate: a failure inside
 * `activate` FLIES ON here rather than turning into a complaint. In a browser one
 * plugin's refusal must not bring the others down; in a test, a swallowed exception is
 * a green test on a broken plugin.
 */
export class FakeHost {
  readonly registry: FakeRegistry;
  readonly surface: FakeSurface;
  /** The registry's named refusals: a test reads them as a list. */
  readonly complaints: string[] = [];

  private readonly ides = new Map<string, FakeIde>();
  private readonly instances = new Map<unknown, unknown>();
  private readonly built: Array<{ name: string; instance: object }> = [];

  constructor() {
    this.registry = new FakeRegistry((message) => this.complaints.push(message));
    this.surface = new FakeSurface(this);
  }

  /**
   * First pass: construct, attach the services, collect the key declarations.
   * Activation comes separately and after all of them, otherwise load order starts to
   * matter.
   */
  add<T>(ctor: PluginClass<T>, name: string): T {
    const ide = new FakeIde(name, this);
    const instance = new ctor(ide) as object;
    attach(instance, ide);
    for (const spec of registriesOf(ctor)) {
      this.registry.declare(spec.key, name, spec.schema);
    }
    const title = passportOf(ctor)?.title ?? name;
    for (const spec of sectionsOf(ctor)) this.registry.add('settings', { ...spec, owner: name, title }, name);
    this.ides.set(name, ide);
    this.instances.set(ctor, instance);
    this.built.push({ name, instance });
    return instance as T;
  }

  /**
   * Second pass: commands, then activation, as in the application. Commands before the
   * plugins come up: a button and a registry entry refer to them by id, and by the
   * first click they have to exist.
   */
  async start(): Promise<void> {
    for (const one of this.built) {
      for (const cmd of commandsOf(one.instance)) {
        this.ide(one.name).commands.set(cmd.id, cmd.run as () => void);
      }
    }
    for (const one of this.built) await hooksOf(one.instance).start?.();
  }

  /** One plugin's services: what it asked for, and what to answer it with. */
  ide(name: string): FakeIde {
    const found = this.ides.get(name);
    if (!found) throw new Error(`plugin not up: ${name}`);
    return found;
  }

  plugin<T>(ctor: PluginClass<T>): T {
    const found = this.instances.get(ctor);
    if (!found) throw new Error(`plugin not up: ${ctor.name}`);
    return found as T;
  }

  /** Run a command, the way a key or a button does. */
  run(id: string): boolean {
    for (const ide of this.ides.values()) {
      const found = ide.commands.get(id);
      if (found) {
        found();
        return true;
      }
    }
    return false;
  }

  /** Every command of every plugin that came up. */
  commands(): string[] {
    return [...this.ides.values()].flatMap((ide) => [...ide.commands.keys()]).sort();
  }

  /**
   * All the settings in one go. The cast here is the ONE deliberate one: assembling a
   * full `Settings` in every test for the sake of one field is a way never to write a
   * test at all.
   */
  setSettings(partial: unknown): void {
    this.surface.settings.value = partial as Settings;
  }
}

interface Node {
  type: unknown;
  props: Record<string, unknown>;
}

/**
 * A flat list of the nodes of the tree the plugin returned.
 *
 * Nodes rather than HTML: with a string one would have to search by class name, and
 * `onClick` is not visible in it at all — while clicking is exactly what is being
 * checked. The order is top-down traversal, i.e. the order a human reads the interface
 * in.
 */
export function nodes(tree: unknown): Node[] {
  const out: Node[] = [];
  const walk = (item: unknown): void => {
    if (item === null || item === undefined || typeof item !== 'object') return;
    if (Array.isArray(item)) {
      for (const one of item) walk(one);
      return;
    }
    const node = item as Node;
    if (!('props' in node)) return;
    out.push(node);
    walk((node.props as { children?: unknown }).children);
  };
  walk(tree);
  return out;
}

/** Nodes of one kind: `nodes(tree, 'button')`. */
export function of(tree: unknown, type: string): Node[] {
  return nodes(tree).filter((node) => node.type === type);
}

/**
 * Why an entry did not fit. Word for word as in the core, and this is the only place
 * where the harness REPEATS the core rather than calling it.
 *
 * The repetition is deliberate. Dragging the real registry in here would mean adding an
 * export to the contract that a plugin could import — and it is not shared, so it would
 * be built as a SECOND copy with second signals and silently drift from the real one.
 * The registry here is deliberately stupid: arrays instead of signals, no runtime at
 * all. That the two wordings agree is guarded by a core test checking the same phrase
 * from the other side.
 */
function why(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => {
      const where = error.instancePath || '/';
      const params = error.params as Record<string, unknown> | undefined;
      const named = params?.['additionalProperty'] ?? params?.['missingProperty'];
      const extra = typeof named === 'string' ? ` «${named}»` : '';
      return `${where} ${error.message ?? ''}${extra}`;
    })
    .join('; ');
}
