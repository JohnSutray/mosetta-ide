import Ajv, { type ValidateFunction } from 'ajv';
import { signal, type Signal } from '@preact/signals';
import type { Diagnostic, DocState, HoverInfo, Settings, WorkspaceInfo } from '@ide/protocol';
import { attach, hooksOf, registriesOf } from './client.js';
import type {
  ClientSurface,
  CodeChunk,
  FileProblems,
  Found,
  Ide,
  Hunk,
  Palette,
  PluginClass,
  Reveal,
  SymbolAsk,
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
export function goTo(path: string, line: number, character?: number): Promise<void> {
  return surface().goTo(path, line, character);
}
export function runCommand(id: string): boolean {
  return surface().runCommand(id);
}
export function keysFor(command: string): string[] {
  return surface().keysFor(command);
}
export function editDoc(text: string): void {
  surface().editDoc(text);
}
export function closeFile(): Promise<void> {
  return surface().closeFile();
}
export function visit(path: string, line: number, character: number): void {
  surface().visit(path, line, character);
}
export function unstable_diffLines(before: string, after: string): Hunk[] {
  return surface().unstable_diffLines(before, after);
}
export function unstable_askSymbol(where: SymbolAsk): Promise<void> {
  return surface().unstable_askSymbol(where);
}
export function hover(path: string, line: number, character: number): Promise<HoverInfo | null> {
  return surface().hover(path, line, character);
}
export function takeFocusOnMount(): boolean {
  return surface().takeFocusOnMount();
}
export function chordHeld(
  command: string,
  event: { metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean },
): boolean {
  return surface().chordHeld(command, event);
}
export function unstable_textStyle(settings: {
  fontFamily: string;
  ligatures: boolean;
}): Record<string, string> {
  return surface().unstable_textStyle(settings);
}
export function unstable_languageFor(path: string): unknown {
  return surface().unstable_languageFor(path);
}
export function unstable_paintCode(text: string, path: string): CodeChunk[] {
  return surface().unstable_paintCode(text, path);
}

export const problems: { readonly value: FileProblems[] } = {
  get value() {
    return surface().problems.value;
  },
};
export const settings: { readonly value: Settings | null } = {
  get value() {
    return surface().settings.value;
  },
};
export const dirty: { readonly value: boolean } = {
  get value() {
    return surface().dirty.value;
  },
};
export const project: { readonly value: WorkspaceInfo | null } = {
  get value() {
    return surface().project.value;
  },
};
export const openDoc: { readonly value: DocState | null } = {
  get value() {
    return surface().openDoc.value;
  },
};
export const fileDiagnostics: { readonly value: Diagnostic[] } = {
  get value() {
    return surface().fileDiagnostics.value;
  },
};
export const externalEpoch: { readonly value: number } = {
  get value() {
    return surface().externalEpoch.value;
  },
};
export const pendingReveal: { readonly value: Reveal | null } = {
  get value() {
    return surface().pendingReveal.value;
  },
};
export const wantsFocus: { readonly value: number } = {
  get value() {
    return surface().wantsFocus.value;
  },
};
export const unstable_darcula: unknown = { fake: 'darcula' };
export const unstable_dc: Palette = new Proxy(
  {},
  { get: (_target, key: string) => `var(--fake-${key})` },
) as Palette;
export const unstable_inputKeymap: readonly unknown[] = [];

export { activate, registry, remote, stub } from './client.js';

export interface Tip {
  text: string;
  keys: string[];
}

export class FakeSurface implements ClientSurface {
  readonly problems: Signal<FileProblems[]> = signal([]);
  readonly settings: Signal<Settings | null> = signal(null);

  readonly jumps: Array<{ path: string; line: number; character?: number }> = [];
  tip: Tip | null = null;
  readonly keys = new Map<string, string[]>();

  readonly project: Signal<WorkspaceInfo | null> = signal(null);
  readonly openDoc: Signal<DocState | null> = signal(null);
  readonly dirty = signal(false);
  closed = 0;
  readonly fileDiagnostics: Signal<Diagnostic[]> = signal([]);
  readonly externalEpoch = signal(0);
  readonly pendingReveal: Signal<Reveal | null> = signal(null);
  readonly wantsFocus = signal(0);
  readonly edits: string[] = [];
  readonly visits: Array<{ path: string; line: number; character: number }> = [];
  readonly symbols: SymbolAsk[] = [];
  readonly hovers: Array<{ path: string; line: number; character: number }> = [];
  readonly heads = new Map<string, string>();
  readonly chords = new Set<string>();
  focusOnMount = true;

  constructor(private readonly host: FakeHost) {}

  t(key: string, params?: Record<string, string | number>): string {
    if (!params) return key;
    const tail = Object.entries(params)
      .map(([name, value]) => `${name}=${value}`)
      .join(',');
    return `${key}(${tail})`;
  }

  async goTo(path: string, line: number, character?: number): Promise<void> {
    this.jumps.push({ path, line, character });
  }

  runCommand(id: string): boolean {
    return this.host.run(id);
  }

  keysFor(command: string): string[] {
    return this.keys.get(command) ?? [];
  }

  editDoc(text: string): void {
    this.edits.push(text);
  }

  async closeFile(): Promise<void> {
    this.openDoc.value = null;
    this.closed += 1;
  }

  visit(path: string, line: number, character: number): void {
    this.visits.push({ path, line, character });
  }

  unstable_diffLines(before: string, after: string): Hunk[] {
    if (before === after) return [];
    const a = before.split('\n');
    const b = after.split('\n');
    return [{ kind: 'modified', from: 1, to: Math.max(a.length, b.length), before: a }];
  }

  async unstable_askSymbol(where: SymbolAsk): Promise<void> {
    this.symbols.push(where);
  }

  async hover(path: string, line: number, character: number): Promise<HoverInfo | null> {
    this.hovers.push({ path, line, character });
    return null;
  }

  takeFocusOnMount(): boolean {
    const wanted = this.focusOnMount;
    this.focusOnMount = true;
    return wanted;
  }

  chordHeld(command: string, event: { metaKey: boolean }): boolean {
    void event;
    return this.chords.has(command);
  }

  unstable_textStyle(settings: { fontFamily: string; ligatures: boolean }): Record<string, string> {
    return { fontFamily: settings.fontFamily };
  }

  unstable_languageFor(path: string): unknown {
    return { language: path.slice(path.lastIndexOf('.') + 1) };
  }

  unstable_paintCode(text: string, path: string): CodeChunk[] {
    void path;
    return [{ text, color: null }];
  }

  readonly unstable_darcula = unstable_darcula;
  readonly unstable_dc = unstable_dc;
  readonly unstable_inputKeymap = unstable_inputKeymap;
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
  readonly openers = new Map<string, (found: Found) => void>();
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

  remember<T>(key: string, initial: T): Signal<T> {
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

  open(kind: string, handler: (found: Found) => void): void {
    this.openers.set(kind, handler);
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
