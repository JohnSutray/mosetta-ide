

export type RpcId = number;

export interface RpcRequestFrame<M extends ApiMethod = ApiMethod> {
  jsonrpc: '2.0';
  id: RpcId;
  method: M;
  params: Params<M>;
}

export interface RpcNotificationFrame<E extends EventName = EventName> {
  jsonrpc: '2.0';
  method: E;
  params: EventPayload<E>;
}

export interface RpcResultFrame {
  jsonrpc: '2.0';
  id: RpcId;
  result: unknown;
}

export interface RpcErrorFrame {
  jsonrpc: '2.0';
  id: RpcId | null;
  error: RpcErrorBody;
}

export interface RpcErrorBody {
  code: RpcErrorCode;
  message: string;
  data?: unknown;
}

export type ClientFrame = RpcRequestFrame;
export type ServerFrame = RpcResultFrame | RpcErrorFrame | RpcNotificationFrame;

export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  Internal: -32603,

  NoWorkspace: 1001,
  PathEscape: 1002,
  UnknownWorkspace: 1003,
  NotFound: 1004,
  WrongKind: 1005,
  RevisionConflict: 1006,
  BadRoot: 1007,
  ConnectionLost: 1099,
} as const;
export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];

export type WorkspaceId = string;

export interface WorkspaceInfo {
  id: WorkspaceId;
  root: string;
  name: string;
  sessions: number;
  held: string[];
  openedAt: number;
}

export type EntryKind = 'file' | 'dir';

export interface DirEntry {
  path: string;
  name: string;
  kind: EntryKind;
  size: number;
  mtimeMs: number;
  symlink: boolean;
}

export interface FileText {
  path: string;
  text: string;
  revision: string;
  truncated: boolean;
}

export interface WriteResult {
  path: string;
  revision: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  scope: string;
  message: string;
  at: number;
}

export interface Api {
  'server.ping': { params: null; result: { uptimeMs: number; pid: number } };

  'workspace.open': { params: { root: string }; result: WorkspaceInfo };
  'workspace.attach': { params: { id: WorkspaceId }; result: WorkspaceInfo };
  'workspace.detach': { params: null; result: null };
  'workspace.list': { params: null; result: WorkspaceInfo[] };
  'workspace.current': { params: null; result: WorkspaceInfo | null };
  'workspace.close': { params: { id: WorkspaceId }; result: null };

  'fs.list': { params: { path: string }; result: DirEntry[] };
  'fs.read': { params: { path: string }; result: FileText };
  'fs.write': {
    params: {
      path: string;
      text: string;
      expectedRevision?: string | null;
    };
    result: WriteResult;
  };
}

export type ApiMethod = keyof Api;
export type Params<M extends ApiMethod> = Api[M]['params'];
export type Result<M extends ApiMethod> = Api[M]['result'];

export interface Events {
  'workspace.attached': WorkspaceInfo | null;
  'workspace.list': WorkspaceInfo[];
  'workspace.closed': { id: WorkspaceId };
  log: LogLine;
}

export type EventName = keyof Events;
export type EventPayload<E extends EventName> = Events[E];

export const WS_PATH = '/rpc';
export const DEFAULT_PORT = 4177;

export function isNotification(frame: ServerFrame): frame is RpcNotificationFrame {
  return !('id' in frame);
}

export function isError(frame: ServerFrame): frame is RpcErrorFrame {
  return 'error' in frame;
}
