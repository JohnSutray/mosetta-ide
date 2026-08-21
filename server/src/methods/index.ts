import type { HandlerTable } from '../rpc/context.js';
import { fsList, fsRead, fsWrite } from './fs.js';
import {
  workspaceAttach,
  workspaceClose,
  workspaceCurrent,
  workspaceDetach,
  workspaceList,
  workspaceOpen,
} from './workspace.js';

export const handlers: HandlerTable = {
  'server.ping': (_params, ctx) => ({
    uptimeMs: Date.now() - ctx.startedAt,
    pid: process.pid,
  }),

  'workspace.open': workspaceOpen,
  'workspace.attach': workspaceAttach,
  'workspace.detach': workspaceDetach,
  'workspace.list': workspaceList,
  'workspace.current': workspaceCurrent,
  'workspace.close': workspaceClose,

  'fs.list': fsList,
  'fs.read': fsRead,
  'fs.write': fsWrite,
};
