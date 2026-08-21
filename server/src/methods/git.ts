import type { GitAction } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

export const gitState: Handler<'git.state'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.git.snapshot();

export const gitBranches: Handler<'git.branches'> = (_params, ctx) =>
  ctx.session.requireWorkspace().services.git.branches();

export const gitRefresh: Handler<'git.refresh'> = async (_params, ctx) => {
  const git = ctx.session.requireWorkspace().services.git;
  await git.refresh();
  return git.snapshot();
};

export const gitRun: Handler<'git.run'> = async (params, ctx) => {
  if (!params || typeof params.action !== 'string') {
    throw RpcError.invalidParams('нужен action');
  }
  const git = ctx.session.requireWorkspace().services.git;
  const args = argsFor(params.action, params.branch, params.name);
  return { error: await git.run(args) };
};

function argsFor(action: GitAction, branch?: string, name?: string): string[] {
  switch (action) {
    case 'checkout':
      return ['checkout', ref(branch)];
    case 'create':
      return branch ? ['checkout', '-b', ref(name), ref(branch)] : ['checkout', '-b', ref(name)];
    case 'rename':
      return ['branch', '-m', ref(branch), ref(name)];
    case 'delete':
      return ['branch', '-d', ref(branch)];
    case 'force-delete':
      return ['branch', '-D', ref(branch)];
    case 'push':
      return branch ? ['push', '-u', 'origin', ref(branch)] : ['push'];
    case 'pull':
      return ['pull', '--ff-only'];
    case 'fetch':
      return ['fetch', '--all', '--prune'];
    case 'merge':
      return ['merge', ref(branch)];
    default:
      throw RpcError.invalidParams(`неизвестное действие git: ${String(action)}`);
  }
}

function ref(value: string | undefined): string {
  const name = (value ?? '').trim();
  if (name === '') throw RpcError.invalidParams('нужно имя ветки');
  if (name.startsWith('-') || /[\s~^:?*[\\]/.test(name) || name.includes('..')) {
    throw RpcError.invalidParams(`недопустимое имя ветки: ${name}`);
  }
  return name;
}
