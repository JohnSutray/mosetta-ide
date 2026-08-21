import type { HandlerTable } from '../rpc/context.js';
import { configGet } from './config.js';
import { docClose, docEdit, docOpen, docReload, docSave, docState } from './doc.js';
import { fsList, fsRead, fsWrite } from './fs.js';
import { lspDiagnostics, lspHover, lspStatus } from './lsp.js';
import { indexSearch, indexStats } from './search.js';
import { treeList, treeStats } from './tree.js';
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

  'config.get': configGet,

  'workspace.open': workspaceOpen,
  'workspace.attach': workspaceAttach,
  'workspace.detach': workspaceDetach,
  'workspace.list': workspaceList,
  'workspace.current': workspaceCurrent,
  'workspace.close': workspaceClose,

  'fs.list': fsList,
  'fs.read': fsRead,
  'fs.write': fsWrite,

  'tree.list': treeList,
  'tree.stats': treeStats,
  'doc.open': docOpen,
  'doc.edit': docEdit,
  'doc.save': docSave,
  'doc.reload': docReload,
  'doc.state': docState,
  'doc.close': docClose,

  'index.search': indexSearch,
  'index.stats': indexStats,

  'lsp.status': lspStatus,
  'lsp.hover': lspHover,
  'lsp.diagnostics': lspDiagnostics,
};
