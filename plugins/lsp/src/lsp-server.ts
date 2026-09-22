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

/**
 * A language server on top of the project's BORROWED memory.
 *
 * It lives above the memory layer and only above it: a document's contents come from
 * the core's memory rather than from disk. From that we get for free what is usually
 * fought for: diagnostics arrive against unsaved text, because in memory that text is
 * the current truth. If the server read disk, errors would appear only after a save.
 *
 * It used to live in the core — because only core code could stand on memory. Now the
 * contract lends the memory (`project.memory`), the project spawns the process
 * (`project.start`), and there is not one import from the core in the class.
 * That it starts when the project opens is held by the `onProject` hook.
 */

export type LspEvent =
  | { type: 'status'; status: LspStatus }
  | { type: 'diagnostics'; path: string; diagnostics: Diagnostic[] };

const SEVERITY: Record<number, Severity> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };

/** What the sweep checks by default: files with types. */
const TYPED = ['ts', 'tsx', 'mts', 'cts'];

/**
 * How many files we sweep BLIND — when this system's memory cannot be measured. A
 * constant rather than a setting: a second ceiling would breed a second message, and a
 * human would not know which of them they hit.
 */
const BLIND_LIMIT = 2000;

/**
 * How often to recount the memory after the sweep. The same beat as the daemon's
 * heartbeat: the numbers in one row of the toolbar have to be about one moment.
 */
const MEMORY_BEAT_MS = 15_000;

/** What to call the end of the sweep in the journal. */
const STOP_WORDS: Record<SweepStop, string> = {
  done: 'went through whole',
  budget: 'stopped by the memory budget',
  baseline: 'never started: the budget did not stretch to the project itself',
  blind: 'stopped by the fallback count: memory cannot be measured',
};

/** A protocol key's extension: `src/a.test.ts` → `ts`. */
function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1);
  const at = name.lastIndexOf('.');
  return at <= 0 ? '' : name.slice(at + 1).toLowerCase();
}

export class LspServer {
  /** The pipes come from the project: that is where the process was born. */
  private child: ProcessChild | null = null;
  private process: ProcessHandle | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private readonly diagnostics = new Map<string, Diagnostic[]>();
  private readonly openDocs = new Set<string>();
  /** Who is waiting for this file's diagnostics — the project sweep. */
  private readonly waiting = new Map<string, () => void>();
  /**
   * What the sweep managed to cover: how many were checked of how many eligible. `null`
   * means there has been no sweep yet (or it is off by a setting), and lying about the
   * coverage is not on in either direction.
   */
  private sweep: LspSweep | null = null;
  /**
   * Recounting the memory after the sweep.
   *
   * A number taken at the sweep's end froze forever — and next to it in the toolbar
   * stands the daemon's live number, and together they read as "right now". Worse,
   * after the sweep the server keeps working: memory grows on every edit, and we would
   * sleep through going over budget.
   */
  private watching: ReturnType<typeof setInterval> | null = null;
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
    if (!plan) throw new Error(`${this.settings.command || this.name}: nothing to launch it with`);
    const handle = this.launch({
      command: plan.command,
      args: plan.args,
      cwd: this.root,
      reason: `${this.name} for ${path.basename(this.root)}`,
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
      if (this.state === 'off') return;       this.died(`the process exited (${code ?? signal})`);
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

  /**
   * Keep the memory number live while the server is alive.
   *
   * The same beat as the daemon's heartbeat: two numbers in one row of the toolbar have
   * to be about one and the same moment, otherwise the smaller turns out bigger than
   * the bigger — which a human noticed.
   */
  private watchMemory(): void {
    this.stopWatching();
    if (!this.sweep) return;
    this.watching = setInterval(() => {
      if (this.state !== 'ready' || !this.sweep) return this.stopWatching();
      void this.memoryMb().then((mb) => {
        if (!this.sweep || this.state !== 'ready' || mb === this.sweep.mb) return;
        this.sweep = { ...this.sweep, mb };
        this.emitStatus();
      });
    }, MEMORY_BEAT_MS);
    this.watching.unref?.();
  }

  private stopWatching(): void {
    if (this.watching) clearInterval(this.watching);
    this.watching = null;
  }

  dispose(): void {
    this.stopWatching();
    this.setState('off');
    this.offRam?.();
    this.offRam = null;
    for (const [, slot] of this.pending) slot.reject(new Error('the language server is closed'));
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

  /**
   * Check the WHOLE project rather than only what is open.
   *
   * tsserver answers with diagnostics only about open documents — that is how its
   * protocol works, and `typescript-language-server` does not ask for project errors at
   * all (`areProjectDiagnosticsEnabled` is nailed to `false` there). So opening the
   * files is up to us: in batches, wait for the answer, and close them again.
   *
   * The files STAY open, and that is the main decision here.
   *
   * The temptation was to close after ourselves: checked, released. But checking a
   * closed file is a snapshot rather than knowledge. Remove a field from an interface
   * in one file and everyone who used it becomes broken, while the server no longer
   * looks at them: it does not check closed documents. A minute into the work such a
   * list of errors is lying.
   *
   * On top of that, closing also ERASES: a closed document is accompanied by empty
   * diagnostics — "there is nothing more to show". A tidy sweep that cleaned up after
   * itself took away exactly what it went for.
   *
   * So we opened them, and we hold them. The price is tsserver's memory and its work on
   * every edit, and it is bounded by the MEMORY BUDGET rather than by a count of files:
   * the count was a proxy with an unknown multiplier.
   */
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
        `${this.name}: the project itself takes ${baseMb} MB against a budget of ${budgetMb} — the sweep never started`,
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
          `${this.name}: the budget of ${budgetMb} MB was exhausted at ${mb} MB — checked ` +
            `${this.sweep?.checked ?? 0} files of ${queue.length}`,
        );
        return this.finish('budget', broken, started);
      }
    }
    return this.finish(blind && take.length < queue.length ? 'blind' : 'done', broken, started);
  }

  /** The memory of the server's process tree, in MB. `null` means it cannot be measured. */
  async memoryMb(): Promise<number | null> {
    if (!this.process) return null;
    try {
      return await this.process.memoryMb();
    } catch {
      return null;
    }
  }

  /** The sweep ended: record how, say so in the journal, and announce it outwards. */
  private finish(stopped: SweepStop, broken: number, started: number): void {
    if (this.sweep) this.sweep = { ...this.sweep, stopped };
    this.emitStatus();
    this.watchMemory();
    if (started > 0) {
      this.log.info(
        `${this.name}: swept ${STOP_WORDS[stopped]} — ${this.sweep?.checked ?? 0} files of ` +
          `${this.sweep?.total ?? 0} in ${Date.now() - started} ms, ${broken} with errors, ` +
          `${this.sweep?.mb ?? '?'} MB; they all stay open`,
      );
    }
  }

  /**
   * Wait until the server has FINISHED SPEAKING about this file.
   *
   * Not the first answer: tsserver answers about a file SEVERAL times — first syntax
   * (almost always empty), then semantics, which is where "no such field" and "wrong
   * type" live. Having waited for the first and closed the document, we cut the check
   * off right before the interesting part: on a large project the sweep returned zero
   * errors where `tsc` found nine.
   *
   * So we wait for SILENCE: an answer arrived — we give the server a little more time
   * for the next one, and only then close. Plus an overall ceiling: a server is
   * entitled to stay silent altogether (the file is outside tsconfig, the parse
   * failed), and hanging the whole project's sweep on that is not on.
   */
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

  /**
   * Everything the server has already counted. Needed by a tab that connected AFTER the
   * project check: diagnostics arrive as an event, and it missed the event — and would
   * be left with a clean tree on a broken project.
   */
  knownDiagnostics(): Array<{ path: string; diagnostics: Diagnostic[] }> {
    const out: Array<{ path: string; diagnostics: Diagnostic[] }> = [];
    for (const [path, diagnostics] of this.diagnostics) {
      if (diagnostics.length > 0) out.push({ path, diagnostics });
    }
    return out;
  }

  async hover(key: string, line: number, character: number): Promise<HoverInfo | null> {
    if (this.state !== 'ready') throw new Error(`${this.name} is not ready (${this.state})`);
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

  /**
   * Where a symbol is declared. The servers' answers differ in form — one place, a list
   * of places, or a "link" with two ranges — so the parsing is shared.
   */
  async definition(key: string, line: number, character: number): Promise<SymbolSite[]> {
    return this.sites('textDocument/definition', key, line, character);
  }

  /** Where a symbol is used. We include the declaration: it is a usage too. */
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
    if (this.state !== 'ready') throw new Error(`${this.name} is not ready (${this.state})`);
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

  /**
   * What can be inserted here. The server hands the list over WHOLE for a position,
   * while the client filters and sorts: that way the list's "feel" is entirely in our
   * hands, and the socket is not nudged on every letter — unless the server asked for
   * that itself (`incomplete`).
   */
  async completion(key: string, line: number, character: number, trigger?: string): Promise<CompletionAnswer> {
    if (this.state !== 'ready') throw new Error(`${this.name} is not ready (${this.state})`);
    this.didOpen(key);
    const result = (await this.request('textDocument/completion', {
      textDocument: { uri: this.uri(key) },
      position: { line, character },
      context: trigger ? { triggerKind: 2, triggerCharacter: trigger } : { triggerKind: 1 },
    })) as RawCompletion[] | { items?: RawCompletion[]; isIncomplete?: boolean } | null;
    const list = Array.isArray(result) ? { items: result, isIncomplete: false } : (result ?? {});
    return { items: (list.items ?? []).map(toEntry), incomplete: Boolean(list.isIncomplete) };
  }

  /** Read an item in: the signature, the documentation and the import line. */
  async resolveCompletion(raw: unknown): Promise<CompletionDetails> {
    if (this.state !== 'ready') throw new Error(`${this.name} is not ready (${this.state})`);
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
        reject(new Error(`${method}: the server did not answer within 15 s`));
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
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('outside the project');
    return rel.split(path.sep).join('/');
  }

  /**
   * The process died — and that is an answer to EVERYONE still waiting.
   *
   * Until now the process dying changed only the state, while a request hanging on the
   * pipe honestly sat out its fifteen seconds — and its refusal OVERWROTE the reason.
   * In the journal it looked like this:
   *
   * ```
   * 21:26:21.669 warn typescript: spawn typescript-language-server ENOENT
   * 21:26:36.660 warn typescript: initialize: the server did not answer within 15 s
   * ```
   *
   * The truth was told at the thirteenth millisecond and lost at the fifteenth second.
   * What went outwards was the second line: "did not answer" — that is, "the server is
   * there but silent", whereas there is no server at all, and that is cured by
   * installing rather than by waiting. A fresh machine is exactly the case where there
   * is no language server yet: the first thing an IDE says on a new OS has to be the
   * truth.
   *
   * So the cause of death is one answer to everything: the state and every hanging
   * request receive it at once and verbatim.
   */
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

/** LSP's `CompletionItemKind` numbers into the names the list draws. */
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

/**
 * `typescript-language-server`'s auto-import mark: it glues this character to the front
 * of `sortText` so that such items go to the end, and puts the module into `detail`. It
 * fills `labelDetails` only with a separate tsserver setting, and relying on that is
 * not on.
 */
const IMPORT_MARK = '\uffff';

/**
 * A server's item into ours. The raw one travels alongside: `completionItem/resolve`
 * takes the item back whole, and the server remembers what it was about in its `data`.
 * The import line will come with a second request.
 */
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

/** An item's documentation: a string, or a `MarkupContent` — both are live. */
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

/** LSP hands a tooltip's contents over in three different ways — all three are live. */
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

/**
 * The answer to `definition` comes in three forms: a `Location`, an array of
 * `Location`, and a `LocationLink` with two ranges. We take the one to jump to.
 */
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

/**
 * A line of text to show, and a mark for an import.
 *
 * We recognise an "import" by the line's beginning rather than by parsing: parsing
 * would have to be done per language, and a mistake here costs one extra item in a list
 * the user sees anyway.
 */
function describe(text: string, line: number): { preview: string; isImport: boolean } {
  const raw = text.split(/\r?\n/)[line] ?? '';
  const preview = raw.trim().slice(0, 200);
  return { preview, isImport: /^\s*(import|export)\b/.test(raw) || /\bfrom\s+['"]/.test(raw) };
}
