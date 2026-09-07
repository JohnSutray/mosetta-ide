import Ajv, { type ValidateFunction } from 'ajv';
import { signal, type Signal } from '@preact/signals';
import type {
  DirEntry,
  DocState,
  DocVersion,
  KeyBinding,
  MergeSession,
  Settings,
  WorkspaceInfo,
} from '@ide/protocol';
import { attach, hooksOf, registriesOf } from './client.js';
import type {
  ClientSurface,
  DocWire,
  FsAccess,
  TreeWire,
  MergeAccess,
  WorkspacesAccess,
  KeysAccess,
  KeyEcho,
  TakenKey,
  Ide,
  PluginClass,
  RegistryHandle,
} from './client.js';

let installed: FakeSurface | null = null;

function surface(): FakeSurface {
  if (!installed) {
    throw new Error('поверхность не поднята: заведите FakeHost до импорта плагина');
  }
  return installed;
}

export function t(key: string, params?: Record<string, string | number>): string {
  return surface().t(key, params);
}
export function runCommand(id: string): boolean {
  return surface().runCommand(id);
}
export function keysFor(command: string): string[] {
  return surface().keysFor(command);
}
export function chordHeld(
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean {
  return surface().chordHeld(command, event);
}

export const settings: { readonly value: Settings | null } = {
  get value() {
    return surface().settings.value;
  },
};
export const project: { readonly value: WorkspaceInfo | null } = {
  get value() {
    return surface().project.value;
  },
};
export const tree: TreeWire = {
  list: (path) => surface().tree.list(path),
  onChanged: (handler) => surface().tree.onChanged(handler),
};
export const fs: FsAccess = {
  create: (path, kind) => surface().fs.create(path, kind),
  move: (from, to) => surface().fs.move(from, to),
  copy: (from, to) => surface().fs.copy(from, to),
  remove: (path) => surface().fs.remove(path),
  write: (path, text) => surface().fs.write(path, text),
  writeBytes: (path, base64) => surface().fs.writeBytes(path, base64),
  absolute: (path) => surface().fs.absolute(path),
};
export const docs: DocWire = {
  open: (path) => surface().docs.open(path),
  close: (path) => surface().docs.close(path),
  edit: (path, text, baseVersion) => surface().docs.edit(path, text, baseVersion),
  save: (path) => surface().docs.save(path),
  reload: (path) => surface().docs.reload(path),
  state: (path) => surface().docs.state(path),
  mergeFromDisk: (path) => surface().docs.mergeFromDisk(path),
  onChanged: (handler) => surface().docs.onChanged(handler),
  onExternal: (handler) => surface().docs.onExternal(handler),
  onDiverged: (handler) => surface().docs.onDiverged(handler),
  onMoved: (handler) => surface().docs.onMoved(handler),
  onRemoved: (handler) => surface().docs.onRemoved(handler),
};
export function setSetting(section: string, key: string, value: string | boolean): Promise<void> {
  return surface().setSetting(section, key, value);
}
export function primaryHeld(event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
  return surface().primaryHeld(event);
}
export const merge: MergeAccess = {
  state: () => surface().merge.state(),
  resolve: (path, text) => surface().merge.resolve(path, text),
  cancel: () => surface().merge.cancel(),
  onState: (handler) => surface().merge.onState(handler),
};
export const workspaces: WorkspacesAccess = {
  get current() {
    return surface().workspaces.current;
  },
  get live() {
    return surface().workspaces.live;
  },
  open: (root) => surface().workspaces.open(root),
  switchTo: (id) => surface().workspaces.switchTo(id),
};
export const keys: KeysAccess = {
  get host() {
    return surface().keys.host;
  },
  get os() {
    return surface().keys.os;
  },
  get bindings() {
    return surface().keys.bindings;
  },
  humanize: (key) => surface().keys.humanize(key),
  taken: (scopes) => surface().keys.taken(scopes),
  get echo() {
    return surface().keys.echo;
  },
};
export { activate, registry, remote, stub } from './client.js';

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
  readonly merges: string[] = [];
  saveFails: { code: number; message: string } | null = null;
  readonly mergeSession = { value: null as MergeSession | null };
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
  async mergeFromDisk(path: string): Promise<MergeSession | null> {
    this.merges.push(path);
    return this.mergeSession.value;
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

export class FakeSurface implements ClientSurface {
  readonly settings: Signal<Settings | null> = signal(null);

  tip: Tip | null = null;
  readonly keyLists = new Map<string, string[]>();

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
  readonly settingWrites: Array<{ section: string; key: string; value: string | boolean }> = [];
  primary = false;
  readonly mergeSession = { value: null as MergeSession | null };
  readonly mergeCalls: Array<{ op: string; args: unknown[] }> = [];
  private readonly mergeStateHandlers = new Set<(state: MergeSession | null) => void>();
  readonly merge: MergeAccess = {
    state: async () => this.mergeSession.value,
    resolve: async (path, text) => {
      this.mergeCalls.push({ op: 'resolve', args: [path, text] });
      return this.mergeSession.value;
    },
    cancel: async () => {
      this.mergeCalls.push({ op: 'cancel', args: [] });
    },
    onState: (handler) => {
      this.mergeStateHandlers.add(handler);
      return () => this.mergeStateHandlers.delete(handler);
    },
  };
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
  readonly keyBindings: Signal<KeyBinding[]> = signal([]);
  readonly keyEcho: Signal<KeyEcho | null> = signal(null);
  readonly takenKeys: TakenKey[] = [];
  readonly keys: KeysAccess = {
    host: 'browser',
    os: 'mac',
    bindings: this.keyBindings,
    humanize: (key) => key,
    taken: (scopes) => this.takenKeys.filter((one) => one.scopes.some((scope) => scopes.includes(scope))),
    echo: this.keyEcho,
  };
  pushMergeState(state: MergeSession | null): void {
    this.mergeSession.value = state;
    for (const handler of this.mergeStateHandlers) handler(state);
  }
  readonly heads = new Map<string, string>();
  readonly chords = new Set<string>();
  constructor(private readonly host: FakeHost) {}

  t(key: string, params?: Record<string, string | number>): string {
    if (!params) return key;
    const tail = Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return `${key}(${tail})`;
  }

  runCommand(id: string): boolean {
    return this.host.run(id);
  }

  keysFor(command: string): string[] {
    return this.keyLists.get(command) ?? [];
  }

  chordHeld(command: string, event: { metaKey: boolean }): boolean {
    void event;
    return this.chords.has(command);
  }

  async setSetting(section: string, key: string, value: string | boolean): Promise<void> {
    this.settingWrites.push({ section, key, value });
  }

  primaryHeld(_event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean }): boolean {
    return this.primary;
  }
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
    for (const entry of this.slot(key).peek()) this.check(key, entry.by, entry.value);
  }

  add<T>(key: string, value: T, by: string): () => void {
    const entry = { by, value };
    this.check(key, by, value);
    const slot = this.slot(key);
    slot.value = [...slot.value, entry];
    return () => {
      slot.value = slot.value.filter((item) => item !== entry);
    };
  }

  all<T>(key: string): T[] {
    return this.slot(key).value.map((entry) => entry.value as T);
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

  private check(key: string, by: string, value: unknown): void {
    const schema = this.schemas.get(key);
    if (!schema || schema.validate(value)) return;
    this.complain(`${by} пишет в «${key}» запись не той формы: ${why(schema.validate)}`);
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

  getPlugin<T>(ctor: PluginClass<T>): T {
    return this.host.plugin(ctor);
  }

  complain(message: string): void {
    this.complaints.push(message);
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
    installed = this.surface;
  }

  add<T>(ctor: PluginClass<T>, name: string): T {
    const ide = new FakeIde(name, this);
    const instance = new ctor(ide) as object;
    attach(instance, ide);
    for (const spec of registriesOf(ctor)) {
      this.registry.declare(spec.key, name, spec.schema);
    }
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
