import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import type { LspServerSettings } from './settings.js';
import type { Logger, MemoryEvent, ProcessChild, ProcessHandle, ProjectMemory, RunAsk } from '@mosetta/ide-api/server';
import { FrameDecoder } from './codec.js';
import type { Toolchain } from './toolchain.js';
import type {
  CompletionAnswer,
  CompletionDetails,
  CompletionEntry,
  CompletionKind,
  Diagnostic,
  HoverInfo,
  LspState,
  LspStatus,
  LspSweep,
  Range,
  Severity,
  SweepStop,
  SymbolSite,
} from './types.js';

export type LspEvent =
  | { type: 'status'; status: LspStatus }
  | { type: 'diagnostics'; path: string; diagnostics: Diagnostic[] };

const SEVERITY: Record<number, Severity> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };

const TYPED = ['ts', 'tsx', 'mts', 'cts'];

const BLIND_LIMIT = 2000;

const STOP_WORDS: Record<SweepStop, string> = {
  done: 'прошёл целиком',
  budget: 'остановлен бюджетом памяти',
  baseline: 'не начат: бюджета не хватило на сам проект',
  blind: 'остановлен запасным счётом: память не мерится',
};

function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

export class LspServer {
  private child: ProcessChild | null = null;
  private process: ProcessHandle | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private readonly diagnostics = new Map<string, Diagnostic[]>();
  private readonly openDocs = new Set<string>();
  private readonly waiting = new Map<string, () => void>();
  private sweep: LspSweep | null = null;
  private readonly listeners = new Set<(event: LspEvent) => void>();
  private readonly extensions: Set<string>;
  private nextId = 1;
  private state: LspState = 'off';
  private detail: string | undefined;
  private ready: Promise<void> | null = null;
  private offRam: (() => void) | null = null;

  constructor(
    readonly name: string,
    private readonly settings: LspServerSettings,
    private readonly root: string,
    private readonly memory: ProjectMemory,
    private readonly launch: (ask: RunAsk) => ProcessHandle,
    private readonly toolchain: Toolchain,
    private readonly log: Logger,
  ) {
    this.extensions = new Set(settings.extensions);
  }

  start(): Promise<void> {
    this.ready ??= this.boot().catch((err) => {
      this.setState('failed', err instanceof Error ? err.message : String(err));
      this.log.error(`${this.name}: ${String(err)}`);
    });
    return this.ready;
  }

  private async boot(): Promise<void> {
    this.setState('starting');
    const plan = this.toolchain.launchFor(this.name, this.settings, this.root, this.log);
    if (!plan) throw new Error(`${this.settings.command || this.name}: нечем запустить`);
    const handle = this.launch({
      command: plan.command,
      args: plan.args,
      cwd: this.root,
      reason: `${this.name} для ${path.basename(this.root)}`,
      ...(plan.env ? { env: plan.env } : {}),
      wants: ['user-shell'],
    });
    this.process = handle;
    const child = handle.child;
    this.child = child;

    child.on('error', (err) => {
      this.died(`${this.settings.command || this.name}: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      if (this.state === 'off') return;
      this.died(`процесс завершился (${code ?? signal})`);
    });
    child.stderr.on('data', (chunk) => {
      const text = Buffer.from(chunk).toString('utf8').trim();
      if (text) this.log.debug(`${this.name} stderr: ${text}`);
    });
    child.stdout.on('data', (chunk) => {
      for (const message of this.decoder.push(chunk)) this.handle(message);
    });

    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(this.root).href,
      workspaceFolders: [{ uri: pathToFileURL(this.root).href, name: path.basename(this.root) }],
      capabilities: {
        textDocument: {
          synchronization: { dynamicRegistration: false, didSave: true },
          publishDiagnostics: { relatedInformation: false },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          completion: {
            contextSupport: true,
            completionItem: {
              snippetSupport: false,
              labelDetailsSupport: true,
              deprecatedSupport: true,
              tagSupport: { valueSet: [1] },
              documentationFormat: ['markdown', 'plaintext'],
              resolveSupport: { properties: ['detail', 'documentation', 'additionalTextEdits'] },
            },
          },
        },
        workspace: { workspaceFolders: true, configuration: false },
      },
      initializationOptions: this.toolchain.optionsFor(this.name, this.root, this.log, this.settings.preferences),
    });
    this.notify('initialized', {});
    this.setState('ready');

    this.offRam = this.memory.on((event) => this.onMemory(event));
    for (const doc of this.memory.files()) {
      const resident = this.memory.docSync(doc.path);
      if (resident && resident.openCount > 0) this.didOpen(doc.path);
    }
  }

  dispose(): void {
    this.setState('off');
    this.offRam?.();
    this.offRam = null;
    for (const [, slot] of this.pending) slot.reject(new Error('языковой сервер закрыт'));
    this.pending.clear();
    const child = this.child;
    const running = this.process;
    this.child = null;
    this.process = null;
    if (!child || !running) return;
    try {
      child.stdin.end();
    } catch {}
    running.kill();
  }

  on(listener: (event: LspEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  status(): LspStatus {
    return {
      server: this.name,
      state: this.state,
      ...(this.detail ? { detail: this.detail } : {}),
      openDocs: this.openDocs.size,
      ...(this.sweep ? { sweep: this.sweep } : {}),
    };
  }

  handles(key: string): boolean {
    return this.extensions.has(extensionOf(key));
  }

  async checkProject(
    skip: (key: string) => boolean,
    budgetMb: number,
    batch = 20,
  ): Promise<void> {
    if (this.state !== 'ready') return;

    const checked = new Set(this.settings.checkExtensions ?? TYPED);
    const queue: string[] = [];
    for (const file of this.memory.files()) {
      if (!checked.has(extensionOf(file.path)) || skip(file.path)) continue;
      if (this.openDocs.has(file.path)) continue;
      queue.push(file.path);
    }

    const baseMb = await this.memoryMb();
    this.sweep = { checked: 0, total: queue.length, mb: baseMb, baseMb, budgetMb, stopped: null };
    this.emitStatus();
    if (queue.length === 0) return this.finish('done', 0, 0);

    if (baseMb !== null && baseMb >= budgetMb) {
      this.log.warn(
        `${this.name}: проект сам занимает ${baseMb} МБ при бюджете ${budgetMb} — обход не начат`,
      );
      return this.finish('baseline', 0, 0);
    }

    const blind = baseMb === null;
    const take = blind ? queue.slice(0, BLIND_LIMIT) : queue;

    const started = Date.now();
    let broken = 0;
    for (let at = 0; at < take.length; at += batch) {
      if (this.state !== 'ready') return;
      const slice = take.slice(at, at + batch);
      await Promise.all(slice.map((key) => this.memory.peekDoc(key).catch(() => null)));
      const answers = slice.map((key) => this.expectDiagnostics(key));
      for (const key of slice) this.didOpen(key);
      await Promise.all(answers);
      broken += slice.filter((key) => (this.diagnostics.get(key)?.length ?? 0) > 0).length;

      const mb = await this.memoryMb();
      if (this.sweep) {
        this.sweep = { ...this.sweep, checked: Math.min(at + slice.length, take.length), mb };
        this.emitStatus();
      }
      if (mb !== null && mb > budgetMb) {
        this.log.warn(
          `${this.name}: бюджет ${budgetMb} МБ исчерпан на ${mb} МБ — проверено ` +
            `${this.sweep?.checked ?? 0} файлов из ${queue.length}`,
        );
        return this.finish('budget', broken, started);
      }
    }
    return this.finish(blind && take.length < queue.length ? 'blind' : 'done', broken, started);
  }

  async memoryMb(): Promise<number | null> {
    if (!this.process) return null;
    try {
      return await this.process.memoryMb();
    } catch {
      return null;
    }
  }

  private finish(stopped: SweepStop, broken: number, started: number): void {
    if (this.sweep) this.sweep = { ...this.sweep, stopped };
    this.emitStatus();
    if (started > 0) {
      this.log.info(
        `${this.name}: обход ${STOP_WORDS[stopped]} — ${this.sweep?.checked ?? 0} файлов из ` +
          `${this.sweep?.total ?? 0} за ${Date.now() - started} мс, ${broken} с ошибками, ` +
          `${this.sweep?.mb ?? '?'} МБ; все остаются открытыми`,
      );
    }
  }

  private expectDiagnostics(key: string, quietMs = 500, capMs = 15_000): Promise<void> {
    return new Promise((resolve) => {
      let quiet: NodeJS.Timeout | null = null;
      const done = (): void => {
        if (quiet) clearTimeout(quiet);
        clearTimeout(cap);
        if (this.waiting.get(key) === heard) this.waiting.delete(key);
        resolve();
      };
      const cap = setTimeout(done, capMs);
      cap.unref?.();
      const heard = (): void => {
        if (quiet) clearTimeout(quiet);
        quiet = setTimeout(done, quietMs);
        quiet.unref?.();
        this.waiting.set(key, heard);
      };
      this.waiting.set(key, heard);
    });
  }

  diagnosticsFor(key: string): Diagnostic[] {
    return this.diagnostics.get(key) ?? [];
  }

  knownDiagnostics(): Array<{ path: string; diagnostics: Diagnostic[] }> {
    const out: Array<{ path: string; diagnostics: Diagnostic[] }> = [];
    for (const [path, diagnostics] of this.diagnostics) {
      if (diagnostics.length > 0) out.push({ path, diagnostics });
    }
    return out;
  }

  async hover(key: string, line: number, character: number): Promise<HoverInfo | null> {
    if (this.state !== 'ready') throw new Error(`${this.name} не готов (${this.state})`);
    this.didOpen(key);
    const result = (await this.request('textDocument/hover', {
      textDocument: { uri: this.uri(key) },
      position: { line, character },
    })) as { contents?: unknown; range?: HoverInfo['range'] } | null;

    if (!result?.contents) return null;
    const markdown = renderHover(result.contents);
    if (!markdown.trim()) return null;
    return result.range ? { markdown, range: result.range } : { markdown };
  }

  async definition(key: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.sites('textDocument/definition', key, line, character);
  }

  async references(key: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.sites('textDocument/references', key, line, character, {
      context: { includeDeclaration: true },
    });
  }

  private async sites(
    method: string,
    key: string,
    line: number,
    character: number,
    extra: Record<string, unknown> = {},
  ): Promise<SymbolSite[]> {
    if (this.state !== 'ready') throw new Error(`${this.name} не готов (${this.state})`);
    this.didOpen(key);
    const result = await this.request(method, {
      textDocument: { uri: this.uri(key) },
      position: { line, character },
      ...extra,
    });

    const raw = Array.isArray(result) ? result : result ? [result] : [];
    const out: SymbolSite[] = [];
    for (const item of raw) {
      const place = asLocation(item);
      if (!place) continue;
      let path: string;
      try {
        path = this.keyOf(place.uri);
      } catch {
        continue;
      }
      out.push({
        path,
        line: place.line,
        character: place.character,
        ...describe(this.memory.docSync(path)?.text ?? '', place.line),
      });
    }
    return out;
  }

  async completion(key: string, line: number, character: number, trigger?: string): Promise<CompletionAnswer> {
    if (this.state !== 'ready') throw new Error(`${this.name} не готов (${this.state})`);
    this.didOpen(key);
    const result = (await this.request('textDocument/completion', {
      textDocument: { uri: this.uri(key) },
      position: { line, character },
      context: trigger ? { triggerKind: 2, triggerCharacter: trigger } : { triggerKind: 1 },
    })) as RawCompletion[] | { items?: RawCompletion[]; isIncomplete?: boolean } | null;
    const list = Array.isArray(result) ? { items: result, isIncomplete: false } : (result ?? {});
    return { items: (list.items ?? []).map(toEntry), incomplete: Boolean(list.isIncomplete) };
  }

  async resolveCompletion(raw: unknown): Promise<CompletionDetails> {
    if (this.state !== 'ready') throw new Error(`${this.name} не готов (${this.state})`);
    const item = (await this.request('completionItem/resolve', raw)) as RawCompletion | null;
    const documentation = renderDocumentation(item?.documentation);
    return {
      ...(item?.detail ? { detail: item.detail } : {}),
      ...(documentation ? { documentation } : {}),
      edits: (item?.additionalTextEdits ?? []).map((edit) => ({ range: edit.range, text: edit.newText })),
    };
  }

  private onMemory(event: MemoryEvent): void {
    const key = event.path;
    if (event.type === 'doc.moved') {
      this.didClose(event.from);
      this.didOpen(key);
      return;
    }
    if (this.state !== 'ready' || !this.handles(key)) return;
    switch (event.type) {
      case 'doc.opened':
        this.didOpen(key);
        break;
      case 'doc.changed':
      case 'doc.external':
        if (this.openDocs.has(key)) this.didChange(key);
        break;
      case 'doc.saved':
        if (this.openDocs.has(key)) {
          this.notify('textDocument/didSave', { textDocument: { uri: this.uri(key) } });
        }
        break;
      default:
        break;
    }
  }

  private didOpen(key: string): void {
    if (this.openDocs.has(key) || this.state !== 'ready' || !this.handles(key)) return;
    const doc = this.memory.docSync(key);
    if (!doc) return;
    this.openDocs.add(key);
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: this.uri(key),
        languageId: languageIdFor(key),
        version: doc.version + 1,
        text: doc.text,
      },
    });
    this.emitStatus();
  }

  private didClose(key: string): void {
    if (!this.openDocs.delete(key)) return;
    this.notify('textDocument/didClose', { textDocument: { uri: this.uri(key) } });
    this.emitStatus();
  }

  private didChange(key: string): void {
    const doc = this.memory.docSync(key);
    if (!doc) return;
    this.notify('textDocument/didChange', {
      textDocument: { uri: this.uri(key), version: doc.version + 1 },
      contentChanges: [{ text: doc.text }],
    });
  }

  private handle(message: unknown): void {
    const msg = message as {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message: string };
    };

    if (msg.method === 'textDocument/publishDiagnostics') {
      this.onDiagnostics(msg.params as PublishDiagnostics);
      return;
    }
    if (msg.method && msg.id !== undefined) {
      this.send({ jsonrpc: '2.0', id: msg.id, result: null });
      return;
    }
    if (msg.id === undefined) return;

    const slot = this.pending.get(msg.id);
    if (!slot) return;
    this.pending.delete(msg.id);
    if (msg.error) slot.reject(new Error(msg.error.message));
    else slot.resolve(msg.result);
  }

  private onDiagnostics(params: PublishDiagnostics): void {
    let key: string;
    try {
      key = this.keyOf(params.uri);
    } catch {
      return;
    }
    const diagnostics = params.diagnostics.map(
      (d): Diagnostic => ({
        range: d.range,
        severity: SEVERITY[d.severity ?? 1] ?? 'error',
        message: d.message,
        ...(d.code !== undefined ? { code: d.code } : {}),
        ...(d.source ? { source: d.source } : {}),
      }),
    );
    this.diagnostics.set(key, diagnostics);
    this.emit({ type: 'diagnostics', path: key, diagnostics });
    const waiter = this.waiting.get(key);
    if (waiter) {
      this.waiting.delete(key);
      waiter();
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`${method}: сервер не ответил за 15 с`));
      }, 15_000);
      timer.unref?.();
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  private send(message: unknown): void {
    if (!this.child?.stdin.writable) return;
    this.child.stdin.write(this.decoder.encodeFrame(message));
  }

  private uri(key: string): string {
    return pathToFileURL(path.join(this.root, ...key.split('/'))).href;
  }

  private keyOf(uri: string): string {
    const absolute = fileURLToPath(uri);
    const rel = path.relative(this.root, absolute);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('вне проекта');
    return rel.split(path.sep).join('/');
  }

  private died(reason: string): void {
    this.setState('failed', reason);
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const slot of waiting) slot.reject(new Error(reason));
  }

  private setState(state: LspState, detail?: string): void {
    if (this.state === state && this.detail === detail) return;
    this.state = state;
    this.detail = detail;
    if (detail) this.log.warn(`${this.name}: ${detail}`);
    else this.log.info(`${this.name}: ${state}`);
    this.emitStatus();
  }

  private emitStatus(): void {
    this.emit({ type: 'status', status: this.status() });
  }

  private emit(event: LspEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

interface PublishDiagnostics {
  uri: string;
  diagnostics: Array<{
    range: Diagnostic['range'];
    severity?: number;
    message: string;
    code?: string | number;
    source?: string;
  }>;
}

interface RawCompletion {
  label: string;
  kind?: number;
  detail?: string;
  labelDetails?: { detail?: string; description?: string };
  documentation?: unknown;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  textEdit?: { range?: Range; insert?: Range; newText: string };
  additionalTextEdits?: Array<{ range: Range; newText: string }>;
  deprecated?: boolean;
  tags?: number[];
}

const KINDS: Record<number, CompletionKind> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  17: 'file',
  19: 'folder',
  20: 'member',
  21: 'constant',
  22: 'class',
  25: 'type',
};

const IMPORT_MARK = '\uffff';

function toEntry(item: RawCompletion): CompletionEntry {
  const edit = item.textEdit;
  const range = edit?.range ?? edit?.insert;
  const marked = item.sortText?.startsWith(IMPORT_MARK) ?? false;
  const module = item.labelDetails?.description;
  const detail = module ?? item.labelDetails?.detail ?? item.detail;
  return {
    label: item.label,
    kind: KINDS[item.kind ?? 0] ?? 'other',
    insert: edit?.newText ?? item.insertText ?? item.label,
    ...(range ? { range } : {}),
    sortText: (item.sortText ?? item.label).replace(IMPORT_MARK, ''),
    ...(item.filterText && item.filterText !== item.label ? { filterText: item.filterText } : {}),
    ...(detail ? { detail } : {}),
    ...(marked || module ? { imports: true } : {}),
    ...(item.deprecated || item.tags?.includes(1) ? { deprecated: true } : {}),
    raw: item,
  };
}

function renderDocumentation(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string') {
    return (value as { value: string }).value;
  }
  return '';
}

function languageIdFor(key: string): string {
  switch (extensionOf(key)) {
    case 'ts':
    case 'mts':
    case 'cts':
      return 'typescript';
    case 'tsx':
      return 'typescriptreact';
    case 'jsx':
      return 'javascriptreact';
    default:
      return 'javascript';
  }
}

function renderHover(contents: unknown): string {
  if (typeof contents === 'string') return contents;
  if (Array.isArray(contents)) return contents.map(renderHover).join('\n\n');
  if (contents && typeof contents === 'object') {
    const obj = contents as { value?: string; language?: string; kind?: string };
    if (typeof obj.value !== 'string') return '';
    if (obj.language) return '```' + obj.language + '\n' + obj.value + '\n```';
    return obj.value;
  }
  return '';
}

function asLocation(item: unknown): { uri: string; line: number; character: number } | null {
  if (typeof item !== 'object' || item === null) return null;
  const any = item as Record<string, unknown>;
  const uri = typeof any.uri === 'string' ? any.uri : typeof any.targetUri === 'string' ? any.targetUri : null;
  const range = (any.range ?? any.targetSelectionRange ?? any.targetRange) as
    | { start?: { line?: number; character?: number } }
    | undefined;
  if (!uri || !range?.start || typeof range.start.line !== 'number') return null;
  return { uri, line: range.start.line, character: range.start.character ?? 0 };
}

function describe(text: string, line: number): { preview: string; isImport: boolean } {
  const raw = text.split(/\r?\n/)[line] ?? '';
  const preview = raw.trim().slice(0, 200);
  return { preview, isImport: /^\s*(import|export)\b/.test(raw) || /\bfrom\s+['"]/.test(raw) };
}
