/** JSON-RPC 2.0 frames and error codes. The transport is one WebSocket per tab. */

export type RpcId = number;

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

export interface RpcNotificationFrame {
  jsonrpc: '2.0';
  method: string;
  params: unknown;
}

export type ServerFrame = RpcResultFrame | RpcErrorFrame | RpcNotificationFrame;

export interface RpcErrorBody {
  code: RpcErrorCode;
  message: string;
  data?: unknown;
}

export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  Internal: -32603,

  /** The method is project-scoped but the session has no workspace attached. */
  NoWorkspace: 1001,
  /** The path tries to escape the workspace root. */
  PathEscape: 1002,
  /** No such workspace, or it has already been closed. */
  UnknownWorkspace: 1003,
  /** No such file or directory on disk. */
  NotFound: 1004,
  /** A file was expected and a directory found, or the other way round. */
  WrongKind: 1005,
  /** The file on disk changed after we read it. */
  RevisionConflict: 1006,
  /** The path does not exist or is not a project directory. */
  BadRoot: 1007,
  /** The document is not open in memory: the RAM layer knows nothing about it. */
  DocNotOpen: 1008,
  /** The edit arrived against an outdated document version. */
  StaleVersion: 1009,
  /** The language server is not running, or it crashed. */
  LspUnavailable: 1010,
  /**
   * The connection dropped with calls still in flight. Never travels over the
   * wire: the client raises it locally so that panels see one shape of error.
   */
  ConnectionLost: 1099,
} as const;
export type RpcErrorCode = (typeof RpcErrorCode)[keyof typeof RpcErrorCode];

export function isNotification(frame: ServerFrame): frame is RpcNotificationFrame {
  return !('id' in frame);
}

export function isError(frame: ServerFrame): frame is RpcErrorFrame {
  return 'error' in frame;
}

export const WS_PATH = '/rpc';
export const DEFAULT_PORT = 4177;
