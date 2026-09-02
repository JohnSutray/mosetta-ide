import type { ConfigBundle } from './config.js';
import type { PluginInfo } from './plugins.js';
import type {
  DirEntry,
  DirSuggestion,
  EntryKind,
  DocState,
  DocVersion,
  FileDiagnostics,
  FileText,
  GitAction,
  GitBranch,
  GitChange,
  GitState,
  PushPreview,
  HoverInfo,
  IndexHit,
  IndexKind,
  IndexStats,
  SearchStats,
  LogLine,
  LspStatus,
  MergeSession,
  PackageManagerInfo,
  RecentProject,
  ShellInfo,
  SymbolSite,
  TerminalInfo,
  Visit,
  TerminalKind,
  WorkspaceId,
  WorkspaceInfo,
  WriteResult,
} from './data.js';

export interface Api {
  'server.ping': { params: null; result: { uptimeMs: number; pid: number } };

  'config.get': { params: null; result: ConfigBundle };

  'workspace.open': { params: { root: string }; result: WorkspaceInfo };
  'workspace.attach': { params: { id: WorkspaceId }; result: WorkspaceInfo };
  'workspace.detach': { params: null; result: null };
  'workspace.list': { params: null; result: WorkspaceInfo[] };
  'workspace.current': { params: null; result: WorkspaceInfo | null };
  'workspace.close': { params: { id: WorkspaceId }; result: null };
  'workspace.browse': {
    params: { prefix: string; depth?: number; limit?: number };
    result: DirSuggestion[];
  };
  'env.shells': { params: null; result: ShellInfo[] };
  'env.packageManagers': { params: null; result: PackageManagerInfo[] };
  'config.set': {
    params: { section: string; key: string; value: string | boolean };
    result: { section: string; key: string; value: string | boolean };
  };
  'visits.get': { params: null; result: Visit[] };
  'visits.set': { params: { visits: Visit[] }; result: { saved: number } };
  'workspace.roots': { params: null; result: DirSuggestion[] };
  'workspace.recent': { params: null; result: RecentProject[] };

  'fs.list': { params: { path: string }; result: DirEntry[] };
  'fs.read': { params: { path: string }; result: FileText };
  'fs.write': {
    params: { path: string; text: string; expectedRevision?: string | null };
    result: WriteResult;
  };

  'fs.create': { params: { path: string; kind: EntryKind }; result: DirEntry };
  'fs.move': { params: { from: string; to: string }; result: DirEntry };
  'fs.copy': { params: { from: string; to: string }; result: DirEntry };
  'fs.remove': { params: { path: string }; result: null };
  'fs.writeBytes': { params: { path: string; base64: string }; result: DirEntry };
  'fs.reveal': { params: { path: string }; result: null };
  'fs.absolute': { params: { path: string }; result: { path: string } };

  'tree.list': { params: { path: string }; result: DirEntry[] };
  'tree.stats': { params: null; result: IndexStats };

  'doc.open': { params: { path: string }; result: DocState };
  'doc.edit': { params: { path: string; text: string; baseVersion: number }; result: DocVersion };
  'doc.save': { params: { path: string }; result: DocState };
  'doc.reload': { params: { path: string }; result: DocState };
  'doc.state': { params: { path: string }; result: DocState };
  'doc.close': { params: { path: string }; result: null };
  'doc.mergeFromDisk': { params: { path: string }; result: MergeSession | null };

  'index.search': {
    params: { query: string; limit?: number; kinds?: IndexKind[] };
    result: IndexHit[];
  };
  'index.stats': { params: null; result: SearchStats };

  'lsp.status': { params: null; result: LspStatus[] };
  'lsp.hover': { params: { path: string; line: number; character: number }; result: HoverInfo | null };
  'lsp.problems': { params: null; result: FileDiagnostics[] };
  'lsp.diagnostics': { params: { path: string }; result: FileDiagnostics };
  'lsp.definition': {
    params: { path: string; line: number; character: number };
    result: SymbolSite[];
  };
  'lsp.references': {
    params: { path: string; line: number; character: number };
    result: SymbolSite[];
  };

  'git.state': { params: null; result: GitState };
  'git.branches': { params: null; result: GitBranch[] };
  'git.outgoing': { params: null; result: PushPreview };
  'git.changes': { params: { commit?: string }; result: GitChange[] };
  'git.refresh': { params: null; result: GitState };
  'git.head': { params: { path: string }; result: { path: string; text: string | null } };
  'git.run': {
    params: { action: GitAction; branch?: string; name?: string };
    result: { error: string | null };
  };

  'merge.state': { params: null; result: MergeSession | null };
  'merge.resolve': { params: { path: string; text: string | null }; result: MergeSession | null };
  'merge.cancel': { params: null; result: null };

  'plugins.list': { params: null; result: PluginInfo[] };
  'plugins.code': { params: { name: string }; result: { code: string } };
  'plugins.call': {
    params: { name: string; method: string; params: unknown };
    result: unknown;
  };

  'term.list': { params: null; result: TerminalInfo[] };
  'term.create': { params: { cols?: number; rows?: number }; result: TerminalInfo };
  'term.open': {
    params: {
      name: string;
      kind?: TerminalKind;
      command?: string;
      cwd?: string;
      cols?: number;
      rows?: number;
    };
    result: TerminalInfo;
  };
  'term.attach': { params: { name: string }; result: { info: TerminalInfo; buffer: string } };
  'term.write': { params: { name: string; data: string }; result: null };
  'term.resize': { params: { name: string; cols: number; rows: number }; result: null };
  'term.close': { params: { name: string }; result: null };
}

export type ApiMethod = keyof Api;
export type Params<M extends ApiMethod> = Api[M]['params'];
export type Result<M extends ApiMethod> = Api[M]['result'];

export interface Events {
  'workspace.attached': WorkspaceInfo | null;
  'workspace.list': WorkspaceInfo[];
  'workspace.closed': { id: WorkspaceId };

  'config.changed': ConfigBundle;

  'doc.changed': DocVersion;
  'doc.external': { path: string; revision: string };
  'doc.diverged': { path: string; reason: 'changed' | 'removed' };
  'tree.changed': { path: string };
  'doc.removed': { path: string };
  'doc.moved': { from: string; path: string };

  'lsp.status': LspStatus;
  'lsp.diagnostics': FileDiagnostics;

  'term.list': TerminalInfo[];
  'term.data': { name: string; data: string };
  'term.exit': { name: string; exitCode: number };

  'merge.state': MergeSession | null;

  'git.state': GitState;
  'git.output': { action: GitAction; chunk: string };

  'plugins.event': { name: string; event: string; payload: unknown };

  log: LogLine;
}

export type EventName = keyof Events;
export type EventPayload<E extends EventName> = Events[E];
