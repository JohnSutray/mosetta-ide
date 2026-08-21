import type { ConfigBundle } from './config.js';
import type {
  DirEntry,
  DirSuggestion,
  DocState,
  DocVersion,
  FileDiagnostics,
  FileText,
  GitAction,
  GitBranch,
  GitState,
  HoverInfo,
  IndexHit,
  IndexKind,
  IndexStats,
  SearchStats,
  LogLine,
  LspStatus,
  NpmScriptInfo,
  TerminalInfo,
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
  'workspace.browse': { params: { prefix: string }; result: DirSuggestion[] };

  'fs.list': { params: { path: string }; result: DirEntry[] };
  'fs.read': { params: { path: string }; result: FileText };
  'fs.write': {
    params: { path: string; text: string; expectedRevision?: string | null };
    result: WriteResult;
  };

  'tree.list': { params: { path: string }; result: DirEntry[] };
  'tree.stats': { params: null; result: IndexStats };

  'doc.open': { params: { path: string }; result: DocState };
  'doc.edit': { params: { path: string; text: string; baseVersion: number }; result: DocVersion };
  'doc.save': { params: { path: string }; result: DocState };
  'doc.reload': { params: { path: string }; result: DocState };
  'doc.state': { params: { path: string }; result: DocState };
  'doc.close': { params: { path: string }; result: null };

  'index.search': {
    params: { query: string; limit?: number; kinds?: IndexKind[] };
    result: IndexHit[];
  };
  'index.stats': { params: null; result: SearchStats };

  'lsp.status': { params: null; result: LspStatus[] };
  'lsp.hover': { params: { path: string; line: number; character: number }; result: HoverInfo | null };
  'lsp.diagnostics': { params: { path: string }; result: FileDiagnostics };

  'npm.list': { params: null; result: NpmScriptInfo[] };
  'npm.run': { params: { id: string; cols?: number; rows?: number }; result: TerminalInfo };

  'git.state': { params: null; result: GitState };
  'git.branches': { params: null; result: GitBranch[] };
  'git.refresh': { params: null; result: GitState };
  'git.run': {
    params: { action: GitAction; branch?: string; name?: string };
    result: { error: string | null };
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
  'doc.conflict': { path: string };
  'tree.changed': { path: string };
  'doc.removed': { path: string };

  'lsp.status': LspStatus;
  'lsp.diagnostics': FileDiagnostics;

  'term.list': TerminalInfo[];
  'term.data': { name: string; data: string };
  'term.exit': { name: string; exitCode: number };

  'git.state': GitState;

  log: LogLine;
}

export type EventName = keyof Events;
export type EventPayload<E extends EventName> = Events[E];
