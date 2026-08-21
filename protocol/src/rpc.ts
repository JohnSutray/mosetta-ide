
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

  NoWorkspace: 1001,
  PathEscape: 1002,
  UnknownWorkspace: 1003,
  NotFound: 1004,
  WrongKind: 1005,
  RevisionConflict: 1006,
  BadRoot: 1007,
  DocNotOpen: 1008,
  StaleVersion: 1009,
  LspUnavailable: 1010,
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
