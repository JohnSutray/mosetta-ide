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
import { attach, hooksOf, passportOf, registriesOf, sectionsOf } from './client.js';
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

export interface Tip {
  text: string;
  keys: string[];
}

export class FakeDocWire implements DocWire {
  readonly texts = new Map<string, string>();
  readonly opened: string[] = [];
  readonly closed: string[] = [];
  readonly edits: Array<{ path: string; text: string }> = [];
  readonly saved: string[] = [];
  readonly reloaded: string[] = [];
  saveFails: { code: number; message: string } | null = null;
  editFails: { code: number; message: string } | null = null;
  private version = 1;
  private readonly changed = new Set<(event: DocVersion) => void>();
  private readonly external = new Set<(event: { path: string; revision: string }) => void>();
  private readonly diverged = new Set<(event: { path: string; reason: 'changed' | 'removed' }) => void>();
  private readonly moved = new Set<(event: { from: string; path: string }) => void>();
  private readonly removed = new Set<(event: { path: string }) => void>();

  private stateOf(path: string): DocState {
    const text = this.texts.get(path);
    if (text === undefined) throw new Error(`нет файла ${path}`);
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
    this.version += 1;
    return { path, version: this.version, dirty: true };
  }
  async save(path: string): Promise<DocState> {
    if (this.saveFails) throw Object.assign(new Error(this.saveFails.message), { code: this.saveFails.code });
    this.saved.push(path);
    return this.stateOf(path);
  }
  async reload(path: string): Promise<DocState> {
    this.reloaded.push(path);
    return this.stateOf(path);
  }
  async state(path: string): Promise<DocState> {
    return this.stateOf(path);
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

  readonly projectPath: Signal<string | null> = signal('/tmp/stand/.mosetta/settings.json');
  readonly settingResets: Array<{ section: string; key: string }> = [];
  readonly resetSetting = async (section: string, key: string): Promise<void> => {
    this.settingResets.push({ section, key });
  };

  readonly titles: string[] = [];
  readonly mount: Mount = {
    size: signal({ w: 1280, h: 720 }),
    bounds: () => ({ left: 0, top: 0, right: 1280, bottom: 720 }),
    local: (x, y) => ({ x, y }),
    idle: (el) => el === null,
    listen: () => () => {},
    title: (text) => {
      this.titles.push(text);
    },
  };

  tip: Tip | null = null;
  readonly connected: Signal<boolean> = signal(true);
  readonly notes = new FakeNotes();

  readonly project: Signal<WorkspaceInfo | null> = signal(null);
  readonly dirs = new Map<string, DirEntry[]>();
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
  changeTree(path: string): void {
    for (const handler of this.treeWatchers) handler({ path });
  }
  readonly fsCalls: Array<{ op: string; args: unknown[] }> = [];
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
    absolute: async (path) => `/абсолютно/${path}`,
  };
  readonly docs = new FakeDocWire();
  readonly settingWrites: Array<{ section: string; key: string; value: SettingValue; scope?: SettingScope }> = [];
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
  readonly heads = new Map<string, string>();
  constructor(private readonly host: FakeHost) {}

  readonly t = (key: string, params?: Record<string, string | number>): string => {
    if (!params) return key;
    const tail = Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return `${key}(${tail})`;
  };

  readonly runCommand = (id: string): boolean => this.host.run(id);
  readonly knownCommands: Signal<Array<{ id: string; about: string }>> = signal([]);

  readonly setSetting = async (
    section: string,
    key: string,
    value: SettingValue,
    scope?: SettingScope,
  ): Promise<void> => {
    this.settingWrites.push({ section, key, value, ...(scope ? { scope } : {}) });
  };
}

export class FakeRegistry {
  private readonly entries = new Map<string, Signal<Array<{ by: string; value: unknown }>>>();
  private readonly schemas = new Map<string, { by: string; validate: ValidateFunction }>();
  private readonly ajv = new Ajv({ allErrors: true, strict: false });

  constructor(private readonly complain: (message: string) => void) {}

  declare(key: string, by: string, schema?: object): void {
    if (this.schemas.has(key)) {
      this.complain(`ключ реестра «${key}» уже объявлен: ${this.schemas.get(key)!.by}`);
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

  layers<T>(key: string): Array<{ by: string; value: T }> {
    return this.slot(key).value as Array<{ by: string; value: T }>;
  }

  authors(key: string): string[] {
    return this.slot(key).value.map((entry) => entry.by);
  }

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
    this.complain(`${by} пишет в «${key}» запись не той формы: ${why(schema.validate)}`);
    return false;
  }
}

export class FakeIde implements Ide {
  readonly commands = new Map<string, () => void>();
  readonly remembered = new Map<string, Signal<unknown>>();
  readonly surfaces: Array<() => unknown> = [];
  readonly styles: string[] = [];
  readonly said: string[] = [];
  readonly complaints: string[] = [];
  readonly work: Array<{ started: string; done?: string; failed?: boolean }> = [];
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly answers = new Map<string, (params: unknown) => unknown>();
  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  readonly rpc = {
    call: async (method: string, params?: unknown): Promise<unknown> => {
      this.calls.push({ method, params });
      const answer = this.answers.get(method);
      if (!answer) throw new Error(`${this.name}: серверу нечем ответить на «${method}»`);
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

export class FakeHost {
  readonly registry: FakeRegistry;
  readonly surface: FakeSurface;
  readonly complaints: string[] = [];

  private readonly ides = new Map<string, FakeIde>();
  private readonly instances = new Map<unknown, unknown>();
  private readonly built: Array<{ name: string; instance: object }> = [];

  constructor() {
    this.registry = new FakeRegistry((message) => this.complaints.push(message));
    this.surface = new FakeSurface(this);
  }

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

  async start(): Promise<void> {
    for (const one of this.built) await hooksOf(one.instance).start?.();
  }

  ide(name: string): FakeIde {
    const found = this.ides.get(name);
    if (!found) throw new Error(`плагин не поднят: ${name}`);
    return found;
  }

  plugin<T>(ctor: PluginClass<T>): T {
    const found = this.instances.get(ctor);
    if (!found) throw new Error(`плагин не поднят: ${ctor.name}`);
    return found as T;
  }

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

  commands(): string[] {
    return [...this.ides.values()].flatMap((ide) => [...ide.commands.keys()]).sort();
  }

  setSettings(partial: unknown): void {
    this.surface.settings.value = partial as Settings;
  }
}

interface Node {
  type: unknown;
  props: Record<string, unknown>;
}

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

export function of(tree: unknown, type: string): Node[] {
  return nodes(tree).filter((node) => node.type === type);
}

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
