import { RpcErrorCode } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const npmList: Handler<'npm.list'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.index.listScripts();

export const npmRun: Handler<'npm.run'> = (params, ctx) => {
  if (!params || typeof params.id !== 'string') {
    throw RpcError.invalidParams('нужен id: string');
  }
  const services = ctx.session.requireWorkspace().services;
  const script = services.index.findScript(params.id);
  if (!script) throw new RpcError(RpcErrorCode.NotFound, `Нет скрипта ${params.id}`);

  const manager = services.packageManager();
  return services.openTerminal({
    name: script.id,
    kind: 'script',
    command: `${manager} run ${script.script}`,
    cwd: parentOf(script.path),
    ...(params.cols ? { cols: params.cols } : {}),
    ...(params.rows ? { rows: params.rows } : {}),
  });
};

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
