import type { HandlerTable } from '../rpc/context.js';
import { configGet, configSet } from './config.js';
import { docClose, docEdit, docOpen, docReload, docSave, docState } from './doc.js';
import {
  fsAbsolute,
  fsCopy,
  fsCreate,
  fsList,
  fsMove,
  fsRead,
  fsRemove,
  fsReveal,
  fsWrite,
  fsWriteBytes,
} from './fs.js';
import {
  gitBranches,
  gitChanges,
  gitOutgoing,
  gitHead,
  gitRefresh,
  gitRun,
  gitState,
} from './git.js';
import { lspDiagnostics, lspHover, lspStatus } from './lsp.js';
import { npmList, npmRun } from './npm.js';
import { indexSearch, indexStats } from './search.js';
import {
  termAttach,
  termClose,
  termCreate,
  termList,
  termOpen,
  termResize,
  termWrite,
} from './term.js';
import { treeList, treeStats } from './tree.js';
import {
  workspaceAttach,
  workspaceBrowse,
  workspaceClose,
  workspaceRecent,
  workspaceRoots,
  envPackageManagers,
  envShells,
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
  'config.set': configSet,

  'workspace.open': workspaceOpen,
  'workspace.attach': workspaceAttach,
  'workspace.detach': workspaceDetach,
  'workspace.list': workspaceList,
  'workspace.current': workspaceCurrent,
  'workspace.close': workspaceClose,
  'workspace.browse': workspaceBrowse,
  'env.shells': envShells,
  'env.packageManagers': envPackageManagers,
  'workspace.roots': workspaceRoots,
  'workspace.recent': workspaceRecent,

  'fs.list': fsList,
  'fs.read': fsRead,
  'fs.write': fsWrite,
  'fs.create': fsCreate,
  'fs.move': fsMove,
  'fs.copy': fsCopy,
  'fs.remove': fsRemove,
  'fs.writeBytes': fsWriteBytes,
  'fs.reveal': fsReveal,
  'fs.absolute': fsAbsolute,

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

  'npm.list': npmList,
  'npm.run': npmRun,

  'git.state': gitState,
  'git.branches': gitBranches,
  'git.outgoing': gitOutgoing,
  'git.changes': gitChanges,
  'git.refresh': gitRefresh,
  'git.head': gitHead,
  'git.run': gitRun,

  'term.list': termList,
  'term.create': termCreate,
  'term.open': termOpen,
  'term.attach': termAttach,
  'term.write': termWrite,
  'term.resize': termResize,
  'term.close': termClose,
};
