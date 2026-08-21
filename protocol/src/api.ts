import type { ConfigBundle } from './config.js';
import type {
  DirEntry,
  DocState,
  DocVersion,
  FileDiagnostics,
  FileText,
  HoverInfo,
  IndexHit,
  IndexStats,
  LogLine,
  LspStatus,
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
  'doc.close': { params: { path: string }; result: null };

  'index.search': { params: { query: string; limit?: number }; result: IndexHit[] };

  'lsp.status': { params: null; result: LspStatus[] };
  'lsp.hover': { params: { path: string; line: number; character: number }; result: HoverInfo | null };
  'lsp.diagnostics': { params: { path: string }; result: FileDiagnostics };
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

  'lsp.status': LspStatus;
  'lsp.diagnostics': FileDiagnostics;

  log: LogLine;
}

export type EventName = keyof Events;
export type EventPayload<E extends EventName> = Events[E];
