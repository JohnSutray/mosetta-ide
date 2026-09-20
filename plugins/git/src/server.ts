import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import { GitCli } from './cli.js';
import { GIT_DEFAULTS } from './settings.js';
import { GitIndex } from './index-git.js';
import { GitStatus } from './status.js';
import type { GitAction, GitState } from './types.js';

/**
 * git's server half.
 *
 * git is the second AXIS rather than a layer of the cake: it has a source of truth of
 * its own, the `.git` directory, which our layers do not see. That is exactly why it
 * moved into a plugin entirely: the core had nothing to lend it beyond spawning
 * subprocesses — and the contract now gives that.
 *
 * The index is taken with `project.use`: it is a resource of the PROJECT — one per open
 * project, going out with it, and telling the tabs itself that it has recounted.
 *
 * Reading hands over the snapshot from memory and waits for NOTHING: git spins in the
 * background, otherwise repainting the tree would run into somebody else's process.
 * Actions are the opposite — they wait: a human pressed "checkout" and has to learn the
 * result.
 */
export default class GitServer {
  /**
   * The only place where git is launched — and therefore it is OPEN to neighbours: the
   * changes panel commits and shelves with the same hands, through
   * `getPlugin(GitServer).cli`. A second git launcher would mean second rules about the
   * index lock, the environment and the complaints.
   */
  readonly cli: GitCli;
  private readonly status = new GitStatus();

  constructor(private readonly ide: Ide) {
    this.cli = new GitCli(ide);
  }

  /**
   * The index lives with the project from the first second: the tree has to open
   * already painted. It hears memory — a file was saved, moved, vanished — and recounts
   * at once rather than by polling; the auto-fetch reads its own setting itself, since
   * the server half now has `ide.settings`.
   */
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
      index.start(() => project.settings('git', GIT_DEFAULTS).statusPollSec);
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
    if (!asked || typeof asked.path !== 'string') throw new Error('path required');
    return { path: asked.path, text: await this.index(call).headText(asked.path) };
  }

  @command() protected async refresh(_p: unknown, call: CallContext): Promise<GitState> {
    const index = this.index(call);
    await index.refresh();
    return index.snapshot();
  }

  /**
   * git's arguments are assembled HERE rather than arriving from the client. The client
   * names an action and a branch; everything else is our business. A branch's name is
   * validated before it reaches the command line: a name beginning with a hyphen would
   * otherwise become a flag.
   */
  @command() protected async run(params: unknown, call: CallContext) {
    const asked = params as { action?: unknown; branch?: string; name?: string } | null;
    if (!asked || typeof asked.action !== 'string') throw new Error('action required');
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
      throw new Error(`unknown git action: ${String(action)}`);
  }
}

/**
 * A branch name that can be trusted with a place on the command line. The prohibitions
 * are taken from git itself (`git check-ref-format`), plus one of our own: a name may
 * not begin with a hyphen, otherwise git takes it for a flag.
 */
function ref(value: string | undefined): string {
  const name = (value ?? '').trim();
  if (name === '') throw new Error('a branch name is required');
  if (name.startsWith('-') || /[\s~^:?*[\\]/.test(name) || name.includes('..')) {
    throw new Error(`an inadmissible branch name: ${name}`);
  }
  return name;
}
