import type { ConfigBundle, PluginInfo, WorkspaceInfo } from '@mosetta/ide-protocol';
import type { Logger } from '@mosetta/ide-api/server';
import { SearchIndex } from '../../../plugins/search/src/index.js';
import { FindProviders } from '../../../plugins/search/src/finds.js';
import { INDEX_DEFAULTS } from '../../../plugins/search/src/settings.js';
import { Grep } from '../../../plugins/find/src/grep.js';
import { ScriptsInPackageJson } from '../../../plugins/npm-scripts/src/scripts.js';
import { DemoFiles } from './memory.js';
import { PretendShell } from './shell.js';
import { DIAGNOSTICS, FILES, HEAD, ROOT, UNTRACKED } from './project.js';

/** What the site's build took from a real daemon: the plugins and the factory config. */
export interface Snapshot {
  config: ConfigBundle;
  plugins: PluginInfo[];
  code: Record<string, string>;
}

type Handler = (params: never) => unknown;

const P = (short: string) => `@mosetta/ide-plugin-${short}`;

const quiet: Logger = { debug() {}, info() {}, warn() {}, error() {} };

/** A failure the client shows as it would show one from a real daemon. */
export class DemoRefusal extends Error {
  constructor(
    message: string,
    readonly code = -32601,
  ) {
    super(message);
  }
}

interface Terminal {
  name: string;
  title: string;
  kind: 'manual' | 'script';
  command?: string;
  createdAt: number;
  shell: PretendShell;
  cols: number;
  rows: number;
}

/**
 * The daemon, played by the page.
 *
 * The core methods run over files held in memory; search and grep are the plugins' own
 * server code, unchanged; git, the language server and the terminal are played with
 * just enough truth to be worth clicking. What really needs a machine — a debugger, a
 * push, a real shell — says so instead of failing silently: the demo keeps the rule
 * that the interface does not lie.
 */
export class DemoDaemon {
  readonly files = new DemoFiles(FILES);
  private readonly head = new Map<string, string | null>();
  private readonly index: SearchIndex;
  private readonly grep = new Grep();
  private readonly terminals = new Map<string, Terminal>();
  private readonly shelf: Array<{ id: string; name: string; at: string; files: string[]; texts: Record<string, string | null> }> = [];
  private readonly breakpoints = new Map<string, unknown[]>();
  private readonly visits: unknown[] = [];
  private readonly chosen: Record<string, number> = {};
  private terminalCount = 0;
  private merging: {
    id: string;
    source: 'fs' | 'git' | 'shelve';
    title: string;
    files: Array<{ path: string; base: string | null; left: { label: string; text: string | null }; right: { label: string; text: string | null }; done: boolean }>;
  } | null = null;
  private readonly config: ConfigBundle;
  private readonly workspace: WorkspaceInfo = {
    id: 'demo',
    root: ROOT,
    name: 'pasture',
    sessions: 1,
    held: [],
    openedAt: Date.now(),
  };
  private readonly methods: Record<string, Handler>;
  private readonly plugins: Record<string, Record<string, Handler>>;

  constructor(
    private readonly snapshot: Snapshot,
    private readonly emit: (method: string, params: unknown) => void,
  ) {
    for (const path of Object.keys(FILES)) {
      this.head.set(path, UNTRACKED.includes(path) ? null : (HEAD[path] ?? FILES[path]!));
    }
    this.config = structuredClone(snapshot.config);
    this.config.projectFile = `${ROOT}/.mosetta/settings.json`;
    const finds = new FindProviders();
    finds.add(new ScriptsInPackageJson());
    this.index = new SearchIndex(this.files, () => INDEX_DEFAULTS, quiet, finds);
    this.index.rebuild();
    this.files.on((event) => {
      if (event.type === 'doc.saved' || event.type === 'doc.external' || event.type === 'tree.changed') this.gitChanged();
    });
    this.methods = this.core();
    this.plugins = this.pluginMethods();
  }

  /**
   * A tab connected: hand it the configuration and the open projects, as the real
   * daemon does unasked, then attach it to the demo project.
   */
  connected(): void {
    this.emit('config.changed', this.config);
    this.emit('workspace.list', [this.workspace]);
    this.emit('workspace.attached', this.workspace);
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    const run = this.methods[method];
    if (!run) throw new DemoRefusal(`The demo daemon has no method ${method}`);
    return run(params as never);
  }

  private pluginEvent(short: string, event: string, payload: unknown): void {
    this.emit('plugins.event', { name: P(short), event, payload });
  }

  private core(): Record<string, Handler> {
    const files = this.files;
    return {
      'server.ping': () => ({
        uptimeMs: Date.now() - this.workspace.openedAt,
        pid: 0,
        rssMb: pageHeapMb(),
        kidsMb: null,
      }),
      'config.get': () => this.config,
      'config.set': (p: { section: string; key: string; value: never }) => {
        (this.config.user[p.section] ??= {})[p.key] = p.value;
        const core = this.config.settings as unknown as Record<string, Record<string, unknown>>;
        if (core[p.section]) core[p.section]![p.key] = p.value;
        this.emit('config.changed', this.config);
        return p;
      },
      'config.reset': (p: { section: string; key: string }) => {
        delete this.config.user[p.section]?.[p.key];
        this.emit('config.changed', this.config);
        return p;
      },
      'workspace.open': () => {
        this.emit('workspace.attached', this.workspace);
        return this.workspace;
      },
      'workspace.attach': () => this.workspace,
      'workspace.detach': () => null,
      'workspace.list': () => [this.workspace],
      'workspace.current': () => this.workspace,
      'workspace.close': () => {
        throw new DemoRefusal('The demo has one project, and it stays open');
      },
      'tree.list': (p: { path: string }) => files.list(p.path),
      'tree.stats': () => ({ files: [...files.files()].length, dirs: 3, bytesResident: 0, builtMs: 1 }),
      'fs.list': (p: { path: string }) => files.list(p.path),
      'fs.read': (p: { path: string }) => {
        const text = files.saved(p.path);
        if (text === null) throw new DemoRefusal(`No such file: ${p.path}`, 1004);
        return { path: p.path, text, revision: '1', truncated: false };
      },
      'fs.write': (p: { path: string; text: string }) => {
        files.write(p.path, p.text);
        return { path: p.path, revision: files.state(p.path).revision };
      },
      'fs.create': (p: { path: string; kind: 'file' | 'dir' }) => {
        files.create(p.path, p.kind);
        if (p.kind === 'file') this.head.set(p.path, null);
        return files.list(parentOf(p.path)).find((one) => one.path === p.path);
      },
      'fs.move': (p: { from: string; to: string }) => {
        for (const one of files.move(p.from, p.to)) {
          this.emit('doc.moved', { from: one.from, path: one.to });
          if (!this.head.has(one.to)) this.head.set(one.to, null);
        }
        return files.list(parentOf(p.to)).find((one) => one.path === p.to);
      },
      'fs.copy': (p: { from: string; to: string }) => {
        files.write(p.to, files.state(p.from).text);
        this.head.set(p.to, null);
        return files.list(parentOf(p.to)).find((one) => one.path === p.to);
      },
      'fs.remove': (p: { path: string }) => {
        for (const gone of files.remove(p.path)) this.emit('doc.removed', { path: gone });
        return null;
      },
      'fs.writeBytes': () => {
        throw new DemoRefusal('Binary files are not kept in the demo');
      },
      'fs.bytes': (p: { path: string }) => {
        const text = files.saved(p.path) ?? '';
        const bytes = new TextEncoder().encode(text);
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return { path: p.path, base64: btoa(binary), bytes: bytes.length, truncated: false };
      },
      'fs.absolute': (p: { path: string }) => ({ path: `${ROOT}/${p.path}` }),
      'doc.open': (p: { path: string }) => files.state(p.path),
      'doc.state': (p: { path: string }) => files.state(p.path),
      'doc.close': () => null,
      'doc.edit': (p: { path: string; text: string }) => {
        const version = files.edit(p.path, p.text);
        this.emit('doc.changed', version);
        return version;
      },
      'doc.save': (p: { path: string }) => files.save(p.path),
      'doc.reload': (p: { path: string }) => files.state(p.path),
      'doc.unsaved': () => ({ paths: files.unsaved() }),
      'plugins.list': () => this.snapshot.plugins,
      'plugins.code': (p: { name: string }) => {
        const code = this.snapshot.code[p.name];
        if (code === undefined) throw new DemoRefusal(`No client code for ${p.name}`);
        return { code };
      },
      'plugins.call': (p: { name: string; method: string; params: unknown }) => {
        const short = p.name.replace('@mosetta/ide-plugin-', '');
        const run = this.plugins[short]?.[p.method];
        if (!run) {
          throw new DemoRefusal(
            `${short}: "${p.method}" needs a real machine behind the IDE — this demo runs in your browser tab`,
          );
        }
        return run(p.params as never);
      },
    };
  }

  private gitFiles(): Record<string, 'modified' | 'added' | 'untracked' | 'deleted'> {
    const out: Record<string, 'modified' | 'added' | 'untracked' | 'deleted'> = {};
    for (const [path, head] of this.head) {
      const now = this.files.saved(path);
      if (now === null) {
        if (head !== null) out[path] = 'deleted';
      } else if (head === null) out[path] = 'untracked';
      else if (head !== now) out[path] = 'modified';
    }
    for (const { path } of this.files.files()) if (!this.head.has(path)) out[path] = 'untracked';
    return out;
  }

  private gitState() {
    return { repo: true, branch: 'main', ahead: 1, behind: 0, files: this.gitFiles(), moved: {} };
  }

  private gitChanged(): void {
    this.pluginEvent('git', 'state', this.gitState());
  }

  /**
   * Somebody changed a file on disk while the editor holds unsaved edits in it. Used to
   * show what the editor does about it; the demo has no other way for a disk to move.
   */
  diverge(path: string, disk: string): void {
    this.files.diverge(path, disk);
    this.emit('doc.diverged', { path, reason: 'changed' });
  }

  /** `git status --short`, for the pretend shell. */
  gitShort(): string[] {
    const mark = { modified: ' M', added: 'A ', untracked: '??', deleted: ' D' } as const;
    return Object.entries(this.gitFiles()).map(([path, state]) => `${mark[state]} ${path}`);
  }

  private words(): Map<string, { path: string; line: number; kind: string; text: string }> {
    const found = new Map<string, { path: string; line: number; kind: string; text: string }>();
    const decl = /^\s*(?:export\s+)?(?:(class|function|interface|type|const|let)\s+(\w+)|(?:readonly\s+|public\s+|private\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>[\]|' ]+)?\s*\{)/;
    for (const { path } of this.files.files()) {
      if (!/\.ts$/.test(path)) continue;
      this.files.state(path).text.split('\n').forEach((text, line) => {
        const m = decl.exec(text);
        if (!m) return;
        const name = m[2] ?? m[3];
        if (!name || ['if', 'for', 'while', 'switch', 'constructor', 'return'].includes(name)) return;
        const kind = m[1] === 'const' || m[1] === 'let' ? 'variable' : (m[1] ?? 'method');
        if (!found.has(name)) found.set(name, { path, line, kind, text: text.trim() });
      });
    }
    return found;
  }

  private wordAt(path: string, line: number, character: number): string | null {
    const text = this.files.state(path).text.split('\n')[line] ?? '';
    const left = /\w*$/.exec(text.slice(0, character))?.[0] ?? '';
    const right = /^\w*/.exec(text.slice(character))?.[0] ?? '';
    return left + right || null;
  }

  private terminalInfo(one: Terminal) {
    return {
      name: one.name,
      title: one.title,
      kind: one.kind,
      pid: 1000 + this.terminals.size,
      cols: one.cols,
      rows: one.rows,
      alive: true,
      busy: one.shell.busy,
      ...(one.command ? { command: one.command, running: one.shell.busy ? 'node' : undefined } : {}),
      createdAt: one.createdAt,
    };
  }

  private openTerminal(name: string, title: string, kind: 'manual' | 'script', command?: string): Terminal {
    const existing = this.terminals.get(name);
    if (existing) return existing;
    const one: Terminal = {
      name,
      title,
      kind,
      ...(command ? { command } : {}),
      createdAt: Date.now(),
      cols: 80,
      rows: 24,
      shell: new PretendShell(this.files, () => this.gitShort(), (data) => this.pluginEvent('terminal', 'data', { name, data })),
    };
    this.terminals.set(name, one);
    one.shell.start(command);
    this.pluginEvent('terminal', 'list', [...this.terminals.values()].map((t) => this.terminalInfo(t)));
    return one;
  }

  private pluginMethods(): Record<string, Record<string, Handler>> {
    const files = this.files;
    const machine = (what: string) => () => {
      throw new DemoRefusal(`${what} needs a real machine behind the IDE — this demo runs in your browser tab`);
    };
    return {
      search: {
        search: (p: { query: string; limit?: number; kinds?: string[] }) => this.index.search(p.query, p.limit, p.kinds),
        stats: () => this.index.stats(),
      },
      find: {
        grep: (p: { masks?: string[]; excludes?: string[]; limit?: number } & Parameters<Grep['pattern']>[0]) => {
          const re = this.grep.pattern(p);
          const hits: unknown[] = [];
          let count = 0;
          if (!re) return { hits, files: 0, total: 0, truncated: false, skipped: 0 };
          const wanted = this.grep.masks(p.masks ?? []);
          const unwanted = this.grep.excludes(p.excludes ?? []);
          for (const { path } of files.files()) {
            if (!wanted(path) || unwanted(path) || !files.isTextual(path)) continue;
            const found = this.grep.scan(path, files.state(path).text, re, 1000);
            if (found.length === 0) continue;
            count += 1;
            hits.push(...found);
          }
          return { hits, files: count, total: hits.length, truncated: false, skipped: 0 };
        },
        replace: (p: { replacement: string; regex?: boolean; paths?: string[]; masks?: string[]; excludes?: string[] } & Parameters<Grep['pattern']>[0]) => {
          const re = this.grep.pattern(p);
          if (!re) return { files: 0, replaced: 0 };
          const only = p.paths ? new Set(p.paths) : null;
          let changed = 0;
          let replaced = 0;
          for (const { path } of files.files()) {
            if (only && !only.has(path)) continue;
            const text = files.state(path).text;
            const n = this.grep.count(text, re);
            if (n === 0) continue;
            files.write(path, this.grep.replace(text, re, p.replacement, p.regex));
            changed += 1;
            replaced += n;
          }
          return { files: changed, replaced };
        },
      },
      symbols: {
        find: (p: { query: string; limit?: number; kinds?: string[] }) => {
          const needle = p.query.trim().toLowerCase();
          const out: unknown[] = [];
          for (const [label, one] of this.words()) {
            if (p.kinds?.length && !p.kinds.includes(one.kind)) continue;
            if (needle && !subsequence(needle, label.toLowerCase())) continue;
            out.push({ label, path: one.path, line: one.line, kind: one.kind });
          }
          return out.slice(0, p.limit ?? 200);
        },
        stats: () => ({ symbols: this.words().size, uncovered: 0, tooBig: 0 }),
      },
      git: {
        state: () => this.gitState(),
        refresh: () => this.gitState(),
        branches: () => [
          { name: 'main', current: true, remote: false, upstream: 'origin/main', ahead: 1, behind: 0, head: '3f9c2e1', subject: 'feat: sheep grow wool when full' },
          { name: 'sheepdog', current: false, remote: false, ahead: 2, behind: 1, head: '8a41d07', subject: 'wip: a dog that keeps the flock together' },
          { name: 'origin/main', current: false, remote: true, ahead: 0, behind: 0, head: 'c02b7aa', subject: 'fix: sheep never leave the pasture' },
        ],
        outgoing: () => ({
          branch: 'main',
          upstream: 'origin/main',
          common: [{ short: 'c02b7aa', subject: 'fix: sheep never leave the pasture', author: 'Dolly', date: '2026-09-18' }],
          remote: [],
          local: [{ short: '3f9c2e1', subject: 'feat: sheep grow wool when full', author: 'Dolly', date: '2026-09-21' }],
        }),
        changes: () => Object.entries(this.gitFiles()).map(([path, state]) => ({ path, state })),
        head: (p: { path: string }) => ({ path: p.path, text: this.head.get(p.path) ?? null }),
        run: (p: { action: string }) => ({
          error: `git ${p.action} needs a real repository — this demo runs in your browser tab`,
        }),
      },
      changes: {
        lists: () => [],
        shelves: () => this.shelf.map(({ texts: _texts, ...item }) => item),
        commit: (p: { files: string[]; message: string }) => {
          for (const path of p.files) this.head.set(path, files.saved(path));
          this.gitChanged();
          return { error: null };
        },
        revert: (p: { files: string[] }) => {
          for (const path of p.files) {
            const head = this.head.get(path);
            if (head === null || head === undefined) {
              files.remove(path);
              this.head.delete(path);
              this.emit('doc.removed', { path });
            } else files.write(path, head);
          }
          this.gitChanged();
          return { error: null };
        },
        shelve: (p: { name: string; files: string[] }) => {
          const texts: Record<string, string | null> = {};
          for (const path of p.files) texts[path] = files.saved(path);
          const item = { id: `shelf-${this.shelf.length + 1}`, name: p.name || p.files[0] || 'shelf', at: new Date().toISOString(), files: p.files };
          this.shelf.unshift({ ...item, texts });
          for (const path of p.files) {
            const head = this.head.get(path);
            if (head === null || head === undefined) files.remove(path);
            else files.write(path, head);
          }
          this.gitChanged();
          return { error: null, item };
        },
        unshelve: (p: { id: string }) => {
          const item = this.shelf.find((one) => one.id === p.id);
          if (!item) return { error: 'no such shelf' };
          for (const [path, text] of Object.entries(item.texts)) if (text !== null) files.write(path, text);
          this.shelf.splice(this.shelf.indexOf(item), 1);
          this.gitChanged();
          return { error: null };
        },
        drop: (p: { id: string }) => {
          const at = this.shelf.findIndex((one) => one.id === p.id);
          if (at >= 0) this.shelf.splice(at, 1);
          return { error: null };
        },
        patch: (p: { id: string }) => ({ text: `# shelf ${p.id}\n` }),
        patchBase: (p: { path: string }) => ({ text: this.head.get(p.path) ?? null }),
        write: (p: { path: string; text: string }) => {
          files.write(p.path, p.text);
          return { error: null };
        },
        lastMessage: () => ({ text: 'feat: sheep grow wool when full' }),
        draftRead: () => ({ text: '' }),
        draftWrite: () => ({ error: null }),
        identity: () => ({ name: 'Visitor', email: 'visitor@example.com', fromGit: { name: 'Visitor', email: 'visitor@example.com' } }),
        identityWrite: () => ({ error: null }),
        listCreate: machine('Changelists'),
        listRename: machine('Changelists'),
        listRemove: machine('Changelists'),
        listMove: machine('Changelists'),
        shelfRename: () => ({ error: null }),
      },
      lsp: {
        status: () => [
          {
            server: 'typescript',
            state: 'ready',
            detail: 'played by the demo',
            openDocs: 0,
            sweep: { checked: 7, total: 7, mb: null, baseMb: null, budgetMb: 3072, stopped: 'done' },
          },
        ],
        problems: () => Object.keys(DIAGNOSTICS).map((path) => this.diagnostics(path)),
        diagnostics: (p: { path: string }) => this.diagnostics(p.path),
        hover: (p: { path: string; line: number; character: number }) => {
          const word = this.wordAt(p.path, p.line, p.character);
          const found = word ? this.words().get(word) : undefined;
          if (!word || !found) return null;
          return { markdown: '```ts\n' + found.text.replace(/\s*\{$/, '') + '\n```\n\n*' + found.path + '*' };
        },
        definition: (p: { path: string; line: number; character: number }) => {
          const word = this.wordAt(p.path, p.line, p.character);
          const found = word ? this.words().get(word) : undefined;
          if (!found) return [];
          const text = files.state(found.path).text.split('\n')[found.line] ?? '';
          return [{ path: found.path, line: found.line, character: Math.max(0, text.indexOf(word!)), preview: text.trim(), isImport: false }];
        },
        references: (p: { path: string; line: number; character: number }) => {
          const word = this.wordAt(p.path, p.line, p.character);
          if (!word) return [];
          const re = new RegExp(`\\b${word}\\b`);
          const out: unknown[] = [];
          for (const { path } of files.files()) {
            if (!/\.ts$/.test(path)) continue;
            files.state(path).text.split('\n').forEach((text, line) => {
              const at = text.search(re);
              if (at >= 0) out.push({ path, line, character: at, preview: text.trim(), isImport: /^\s*import\b/.test(text) });
            });
          }
          return out;
        },
        completion: () => ({
          incomplete: false,
          items: [...this.words()].map(([label, one], i) => ({
            label,
            kind: one.kind === 'variable' ? 'variable' : one.kind === 'method' ? 'method' : one.kind === 'class' ? 'class' : 'function',
            insert: label,
            sortText: String(i).padStart(4, '0'),
            detail: one.path,
            raw: null,
          })),
        }),
        resolve: () => ({ edits: [] }),
      },
      terminal: {
        shells: () => [{ path: '/bin/pretend', name: 'pretend', ref: 'pretend', current: true }],
        list: () => [...this.terminals.values()].map((one) => this.terminalInfo(one)),
        create: () => {
          this.terminalCount += 1;
          const name = `manual-${this.terminalCount}`;
          return this.terminalInfo(this.openTerminal(name, `terminal ${this.terminalCount}`, 'manual'));
        },
        open: (p: { name: string; kind?: 'manual' | 'script'; command?: string }) =>
          this.terminalInfo(this.openTerminal(p.name, p.name.replace(/^.*::/, ''), p.kind ?? 'manual', p.command)),
        attach: (p: { name: string }) => {
          const one = this.terminals.get(p.name);
          if (!one) throw new DemoRefusal(`no terminal ${p.name}`);
          return { info: this.terminalInfo(one), buffer: one.shell.buffer };
        },
        write: (p: { name: string; data: string }) => {
          this.terminals.get(p.name)?.shell.write(p.data);
          return null;
        },
        resize: (p: { name: string; cols: number; rows: number }) => {
          const one = this.terminals.get(p.name);
          if (one) Object.assign(one, { cols: p.cols, rows: p.rows });
          return null;
        },
        close: (p: { name: string }) => {
          this.terminals.get(p.name)?.shell.write('\x03');
          this.terminals.delete(p.name);
          this.pluginEvent('terminal', 'list', [...this.terminals.values()].map((t) => this.terminalInfo(t)));
          return null;
        },
      },
      'npm-scripts': {
        managers: () => [{ path: '/usr/local/bin/npm', name: 'npm', version: '11.0.0', suggested: true, current: true }],
        list: () =>
          this.index.byKind('npm').map((hit) => ({
            id: hit.id ?? '',
            script: (hit.id ?? '').split('::').pop() ?? '',
            command: hit.detail ?? '',
            path: hit.path,
          })),
        run: (p: { id: string }) => {
          const script = p.id.split('::').pop() ?? '';
          return { name: p.id, command: `npm run ${script}`, argv: ['npm', 'run', script], cwd: '' };
        },
      },
      projects: {
        roots: () => [{ path: '/demo', name: 'demo', children: [{ path: ROOT, name: 'pasture' }] }],
        recent: () => [{ root: ROOT, name: 'pasture', openedAt: this.workspace.openedAt }],
        browse: () => [{ path: ROOT, name: 'pasture' }],
        remember: () => null,
      },
      visits: {
        get: () => this.visits,
        set: (p: { visits: unknown[] }) => {
          this.visits.splice(0, this.visits.length, ...p.visits.slice(-200));
          return { saved: this.visits.length };
        },
      },
      completion: {
        choices: () => this.chosen,
        chose: (p: { label: string }) => {
          this.chosen[p.label] = (this.chosen[p.label] ?? 0) + 1;
          return { label: p.label, times: this.chosen[p.label] };
        },
      },
      merge: {
        state: () => this.merging,
        fromDisk: async (p: { path: string }) => {
          const doc = files.docSync(p.path);
          const disk = await files.disk(p.path);
          if (!doc) return this.merging;
          this.merging = {
            id: `merge-${Date.now()}`,
            source: 'fs',
            title: 'merge.title.fs.reload',
            files: [
              {
                path: p.path,
                base: doc.savedText ?? files.saved(p.path),
                left: { label: 'merge.side.editor', text: doc.text },
                right: { label: 'merge.side.disk', text: disk ? disk.text : null },
                done: false,
              },
            ],
          };
          this.pluginEvent('merge', 'state', this.merging);
          return this.merging;
        },
        resolve: (p: { path: string; text: string | null }) => {
          const session = this.merging;
          if (!session) return null;
          const file = session.files.find((one) => one.path === p.path);
          if (file) {
            file.done = true;
            if (p.text !== null) this.emit('doc.changed', files.edit(p.path, p.text));
          }
          this.merging = session.files.every((one) => one.done) ? null : session;
          this.pluginEvent('merge', 'state', this.merging);
          return this.merging;
        },
        cancel: () => {
          this.merging = null;
          this.pluginEvent('merge', 'state', null);
          return null;
        },
      },
      debug: {
        breakpoints: () => [...this.breakpoints].map(([path, breakpoints]) => ({ path, breakpoints })),
        setBreakpoints: (p: { path: string; breakpoints: Array<Record<string, unknown>> }) => {
          const placed = p.breakpoints.map((one) => ({ ...one, verified: false, message: 'Nothing runs in the demo' }));
          this.breakpoints.set(p.path, placed);
          return { path: p.path, breakpoints: placed };
        },
        exceptions: () => 'uncaught',
        setExceptions: (p: { mode: string }) => p.mode,
        runs: () => [],
        forget: () => [],
        launch: machine('The debugger'),
        runFile: machine('Running a file'),
        openBrowser: machine('The debugger'),
        stop: () => null,
      },
      tree: {
        reveal: machine('Revealing a file in the file manager'),
      },
    };
  }

  private diagnostics(path: string) {
    return {
      path,
      diagnostics: (DIAGNOSTICS[path] ?? []).map((one) => ({
        range: { start: { line: one.line, character: one.from }, end: { line: one.line, character: one.to } },
        severity: 'warning' as const,
        message: one.message,
        code: one.code,
        source: 'ts',
      })),
    };
  }
}

/**
 * What "the daemon" holds, honestly: here the daemon is this page, so it is the page's
 * JavaScript heap where the browser reports one (Chrome does), and zero where it does not.
 */
function pageHeapMb(): number {
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : 0;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

function subsequence(needle: string, hay: string): boolean {
  let at = 0;
  for (const ch of hay) if (ch === needle[at]) at += 1;
  return at === needle.length;
}
