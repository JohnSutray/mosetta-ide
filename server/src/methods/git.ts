import type { GitAction } from '@ide/protocol';
import type { Handler } from '../rpc/context.js';
import { RpcError } from '../errors.js';

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
      return branch
        ? ['push', '--progress', '-u', 'origin', ref(branch)]
        : ['push', '--progress'];
    case 'force-push':
      return branch
        ? ['push', '--progress', '--force-with-lease', '-u', 'origin', ref(branch)]
        : ['push', '--progress', '--force-with-lease'];
    case 'pull':
      return ['pull', '--progress', '--ff-only'];
    case 'fetch':
      return ['fetch', '--progress', '--all', '--prune'];
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

export class GitMethods {
  readonly state: Handler<'git.state'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.git.snapshot();

  readonly branches: Handler<'git.branches'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.git.branches();

  readonly outgoing: Handler<'git.outgoing'> = (_params, ctx) =>
    ctx.session.requireWorkspace().services.git.outgoing();

  readonly changes: Handler<'git.changes'> = (params, ctx) =>
    ctx.session.requireWorkspace().services.git.changes(params?.commit);

  readonly head: Handler<'git.head'> = async (params, ctx) => {
    if (!params || typeof params.path !== 'string') throw RpcError.invalidParams('нужен path');
    const git = ctx.session.requireWorkspace().services.git;
    return { path: params.path, text: await git.headText(params.path) };
  };

  readonly refresh: Handler<'git.refresh'> = async (_params, ctx) => {
    const git = ctx.session.requireWorkspace().services.git;
    await git.refresh();
    return git.snapshot();
  };

  readonly run: Handler<'git.run'> = async (params, ctx) => {
    if (!params || typeof params.action !== 'string') {
      throw RpcError.invalidParams('нужен action');
    }
    const git = ctx.session.requireWorkspace().services.git;
    const args = argsFor(params.action, params.branch, params.name);
    return { error: await git.run(params.action, args) };
  };
}

export const gitMethods = new GitMethods();
