import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { GitCli } from './cli.js';
import { GIT_DEFAULTS } from './settings.js';
import { GitIndex } from './index-git.js';
import { GitStatus } from './status.js';
import type { GitAction, GitState } from './types.js';

export default class GitServer {
  readonly cli: GitCli;
  private readonly status = new GitStatus();

  constructor(private readonly ide: Ide) {
    this.cli = new GitCli(ide);
  }

  @activate() protected start(): void {
    this.ide.onProject((project) => {
      const index = this.indexOf(project);
      index.startAutoFetch(() => project.settings('git', GIT_DEFAULTS).autoFetchMinutes);
      const off = project.memory.on((event) => {
        if (['doc.saved', 'doc.removed', 'doc.moved', 'tree.changed', 'doc.external'].includes(event.type)) {
          index.touch();
        }
      });
      project.use('memory-watch', () => ({ dispose: off }));
    });
  }

  private index(call: CallContext): GitIndex {
    return this.indexOf(call.project);
  }

  private indexOf(project: Project): GitIndex {
    return project.use('index', () => {
      const index = new GitIndex(
        this.cli,
        this.status,
        project.root,
        this.ide.log,
        (state) => project.emit('state', state),
        (action, chunk) => project.emit('output', { action, chunk }),
      );
      index.start();
      return index;
    });
  }

  @command() protected state(_p: unknown, call: CallContext): GitState {
    return this.index(call).snapshot();
  }

  @command() protected branches(_p: unknown, call: CallContext) {
    return this.index(call).branches();
  }

  @command() protected outgoing(_p: unknown, call: CallContext) {
    return this.index(call).outgoing();
  }

  @command() protected changes(params: unknown, call: CallContext) {
    const asked = params as { commit?: string } | null;
    return this.index(call).changes(asked?.commit);
  }

  @command() protected async head(params: unknown, call: CallContext) {
    const asked = params as { path?: unknown } | null;
    if (!asked || typeof asked.path !== 'string') throw new Error('нужен path');
    return { path: asked.path, text: await this.index(call).headText(asked.path) };
  }

  @command() protected async refresh(_p: unknown, call: CallContext): Promise<GitState> {
    const index = this.index(call);
    await index.refresh();
    return index.snapshot();
  }

  @command() protected async run(params: unknown, call: CallContext) {
    const asked = params as { action?: unknown; branch?: string; name?: string } | null;
    if (!asked || typeof asked.action !== 'string') throw new Error('нужен action');
    const args = argsFor(asked.action as GitAction, asked.branch, asked.name);
    return { error: await this.index(call).run(asked.action as GitAction, args) };
  }
}

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
      throw new Error(`неизвестное действие git: ${String(action)}`);
  }
}

function ref(value: string | undefined): string {
  const name = (value ?? '').trim();
  if (name === '') throw new Error('нужно имя ветки');
  if (name.startsWith('-') || /[\s~^:?*[\\]/.test(name) || name.includes('..')) {
    throw new Error(`недопустимое имя ветки: ${name}`);
  }
  return name;
}
