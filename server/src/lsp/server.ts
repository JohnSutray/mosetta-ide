import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import type {
  Diagnostic,
  HoverInfo,
  LspServerSettings,
  LspState,
  LspStatus,
  Severity,
} from '@ide/protocol';
import { RpcErrorCode } from '@ide/protocol';
import { RpcError } from '../errors.js';
import type { Logger } from '../log.js';
import type { RamFs } from '../fs/ram-fs.js';
import { extensionOf } from '../workspace/paths.js';
import { encodeFrame, FrameDecoder } from './codec.js';
import { initOptionsFor } from '../env/toolchain.js';

export type LspEvent =
  | { type: 'status'; status: LspStatus }
  | { type: 'diagnostics'; path: string; diagnostics: Diagnostic[] };

const SEVERITY: Record<number, Severity> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };

export class LspServer {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly decoder = new FrameDecoder();
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private readonly diagnostics = new Map<string, Diagnostic[]>();
  private readonly openDocs = new Set<string>();
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
    private readonly ram: RamFs,
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
    const child = spawn(this.settings.command, this.settings.args, {
      cwd: this.root,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });
    this.child = child;

    child.on('error', (err) => {
      this.setState('failed', `${this.settings.command}: ${err.message}`);
    });
    child.on('exit', (code, signal) => {
      if (this.state === 'off') return;
      this.setState('failed', `процесс завершился (${code ?? signal})`);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) this.log.debug(`${this.name} stderr: ${text}`);
    });
    child.stdout.on('data', (chunk: Buffer) => {
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
        },
        workspace: { workspaceFolders: true, configuration: false },
      },
      initializationOptions: initOptionsFor(this.name, this.root, this.log),
    });
    this.notify('initialized', {});
    this.setState('ready');

    this.offRam = this.ram.on((event) => this.onRam(event.type, event.path));
    for (const doc of this.ram.files()) {
      const resident = this.ram.docSync(doc.path);
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
    this.child = null;
    if (!child) return;
    try {
      child.stdin.end();
    } catch {}
    const timer = setTimeout(() => child.kill('SIGKILL'), 1500);
    timer.unref?.();
    child.once('exit', () => clearTimeout(timer));
    child.kill('SIGTERM');
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
    };
  }

  handles(key: string): boolean {
    return this.extensions.has(extensionOf(key));
  }

  diagnosticsFor(key: string): Diagnostic[] {
    return this.diagnostics.get(key) ?? [];
  }

  async hover(key: string, line: number, character: number): Promise<HoverInfo | null> {
    if (this.state !== 'ready') {
      throw new RpcError(RpcErrorCode.LspUnavailable, `${this.name} не готов (${this.state})`);
    }
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

  private onRam(type: string, key: string): void {
    if (this.state !== 'ready' || !this.handles(key)) return;
    switch (type) {
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
    const doc = this.ram.docSync(key);
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

  private didChange(key: string): void {
    const doc = this.ram.docSync(key);
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
    this.child.stdin.write(encodeFrame(message));
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

  private setState(state: LspState, detail?: string): void {
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
