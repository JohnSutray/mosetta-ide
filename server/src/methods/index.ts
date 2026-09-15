import type { HandlerTable } from '../rpc/context.js';
import { configMethods } from './config.js';
import { docMethods } from './doc.js';
import { fsMethods } from './fs.js';
import { pluginMethods } from './plugins.js';
import { treeMethods } from './tree.js';
import { workspaceMethods } from './workspace.js';

export const handlers: HandlerTable = {
  'server.ping': async (_params, ctx) => ({
    uptimeMs: Date.now() - ctx.startedAt,
    pid: process.pid,
    rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    kidsMb: await ctx.memory.kidsMb(process.pid),
  }),

  'config.get': (p, c) => configMethods.get(p, c),
  'config.set': (p, c) => configMethods.set(p, c),
  'config.reset': (p, c) => configMethods.reset(p, c),

  'workspace.open': (p, c) => workspaceMethods.open(p, c),
  'workspace.attach': (p, c) => workspaceMethods.attach(p, c),
  'workspace.detach': (p, c) => workspaceMethods.detach(p, c),
  'workspace.list': (p, c) => workspaceMethods.list(p, c),
  'workspace.current': (p, c) => workspaceMethods.current(p, c),
  'workspace.close': (p, c) => workspaceMethods.close(p, c),

  'fs.list': (p, c) => fsMethods.list(p, c),
  'fs.read': (p, c) => fsMethods.read(p, c),
  'fs.write': (p, c) => fsMethods.write(p, c),
  'fs.create': (p, c) => fsMethods.create(p, c),
  'fs.move': (p, c) => fsMethods.move(p, c),
  'fs.copy': (p, c) => fsMethods.copy(p, c),
  'fs.remove': (p, c) => fsMethods.remove(p, c),
  'fs.writeBytes': (p, c) => fsMethods.writeBytes(p, c),
  'fs.absolute': (p, c) => fsMethods.absolute(p, c),

  'tree.list': (p, c) => treeMethods.list(p, c),
  'tree.stats': (p, c) => treeMethods.stats(p, c),
  'doc.open': (p, c) => docMethods.open(p, c),
  'doc.edit': (p, c) => docMethods.edit(p, c),
  'doc.save': (p, c) => docMethods.save(p, c),
  'doc.reload': (p, c) => docMethods.reload(p, c),
  'doc.state': (p, c) => docMethods.state(p, c),
  'doc.close': (p, c) => docMethods.close(p, c),

  'plugins.list': (p, c) => pluginMethods.list(p, c),
  'plugins.code': (p, c) => pluginMethods.code(p, c),
  'plugins.call': (p, c) => pluginMethods.call(p, c),
};
