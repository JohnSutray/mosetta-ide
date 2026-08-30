import Ajv, { type ValidateFunction } from 'ajv';
import type { ComponentChildren, JSX } from 'preact';
import type { Settings, TerminalInfo } from '@ide/protocol';
import { attach, hooksOf, registriesOf } from './client.js';
import type {
  ClientSurface,
  FileProblems,
  Found,
  Ide,
  PanelHandle,
  PickProps,
  PluginClass,
  ResizerProps,
  PluginPanelSpec,
  RegistryHandle,
} from './client.js';

let installed: FakeSurface | null = null;

function surface(): FakeSurface {
  if (!installed) {
    throw new Error('поверхность не поднята: заведите FakeHost до импорта плагина');
  }
  return installed;
}

export function PickPopup<T>(props: PickProps<T>): JSX.Element {
  return surface().PickPopup(props);
}
export function highlight(text: string, matches: number[]): ComponentChildren {
  return surface().highlight(text, matches);
}
export function shiftMatches(matches: number[], from: number, length: number): number[] {
  return surface().shiftMatches(matches, from, length);
}
export function showTerminal(open: () => Promise<TerminalInfo>): Promise<void> {
  return surface().showTerminal(open);
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
export function showTip(near: Element, text: string, keys?: string[]): void {
  surface().showTip(near, text, keys);
}
export function hideTip(): void {
  surface().hideTip();
}
export function keysFor(command: string): string[] {
  return surface().keysFor(command);
}
export function Resizer(props: ResizerProps): JSX.Element {
  return surface().Resizer(props);
}
export function widthOf(id: string, fallback: number): number {
  return surface().widthOf(id, fallback);
}

export const problems: { readonly value: FileProblems[] } = {
  get value() {
    return surface().problems.value;
  },
};
export const openPath: { readonly value: string | null } = {
  get value() {
    return surface().openPath.value;
  },
};
export const settings: { readonly value: Settings | null } = {
  get value() {
    return surface().settings.value;
  },
};

export { activate, registry, remote, stub } from './client.js';

export interface Tip {
  text: string;
  keys: string[];
}

export class FakeSurface implements ClientSurface {
  readonly problems: { value: FileProblems[] } = { value: [] };
  readonly openPath: { value: string | null } = { value: null };
  readonly settings: { value: Settings | null } = { value: null };

  readonly jumps: Array<{ path: string; line: number; character?: number }> = [];
  readonly terminals: TerminalInfo[] = [];
  tip: Tip | null = null;
  readonly keys = new Map<string, string[]>();
  readonly widths = new Map<string, number>();

  constructor(private readonly host: FakeHost) {}

  PickPopup<T>(props: PickProps<T>): JSX.Element {
    return { type: 'PickPopup', props } as unknown as JSX.Element;
  }

  highlight(text: string, matches: number[]): ComponentChildren {
    return { type: 'highlight', text, matches } as unknown as ComponentChildren;
  }

  shiftMatches(matches: number[], from: number, length: number): number[] {
    return matches.filter((at) => at >= from && at < from + length).map((at) => at - from);
  }

  async showTerminal(open: () => Promise<TerminalInfo>): Promise<void> {
    this.terminals.push(await open());
  }

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

  showTip(near: Element, text: string, keys?: string[]): void {
    void near;
    this.tip = { text, keys: keys ?? [] };
  }

  hideTip(): void {
    this.tip = null;
  }

  keysFor(command: string): string[] {
    return this.keys.get(command) ?? [];
  }

  Resizer(props: ResizerProps): JSX.Element {
    return { type: 'Resizer', props } as unknown as JSX.Element;
  }

  widthOf(id: string, fallback: number): number {
    return this.widths.get(id) ?? fallback;
  }
}

export class FakeRegistry {
  private readonly entries = new Map<string, Array<{ by: string; value: unknown }>>();
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
    for (const entry of this.slot(key)) this.check(key, entry.by, entry.value);
  }

  add<T>(key: string, value: T, by: string): () => void {
    const entry = { by, value };
    this.check(key, by, value);
    this.slot(key).push(entry);
    return () => {
      const list = this.slot(key);
      const at = list.indexOf(entry);
      if (at >= 0) list.splice(at, 1);
    };
  }

  all<T>(key: string): T[] {
    return this.slot(key).map((entry) => entry.value as T);
  }

  authors(key: string): string[] {
    return this.slot(key).map((entry) => entry.by);
  }

  declared(): string[] {
    return [...this.schemas.keys()].sort();
  }

  private slot(key: string): Array<{ by: string; value: unknown }> {
    let found = this.entries.get(key);
    if (!found) {
      found = [];
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

class Flag {
  value: boolean;
  constructor(value: boolean) {
    this.value = value;
  }
}

export interface FakePanel {
  spec: PluginPanelSpec;
  open: Flag;
}

export class FakeIde implements Ide {
  readonly commands = new Map<string, () => void>();
  readonly panels: FakePanel[] = [];
  readonly openers = new Map<string, (found: Found) => void>();
  readonly surfaces: Array<() => unknown> = [];
  readonly styles: string[] = [];
  readonly said: string[] = [];
  readonly calls: Array<{ method: string; params: unknown }> = [];
  readonly answers = new Map<string, (params: unknown) => unknown>();

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

  panel(spec: PluginPanelSpec): PanelHandle {
    const open = new Flag(false);
    this.commands.set(spec.command, () => {
      open.value = !open.value;
    });
    this.panels.push({ spec, open });
    return {
      open,
      toggle: () => {
        open.value = !open.value;
      },
      show: () => {
        open.value = true;
      },
      hide: () => {
        open.value = false;
      },
    };
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
