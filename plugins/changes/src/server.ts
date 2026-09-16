import fs from 'node:fs/promises';
import path from 'node:path';
import { command, type CallContext, type Ide } from '@mosetta/ide-api/server';
import GitServer from '@mosetta/ide-plugin-git/server';
import { Shelf, type ShelfItem } from './shelf.js';

export type { ShelfItem } from './shelf.js';

export default class ChangesServer {
  private readonly shelf = new Shelf(() => this.ide.state);

  constructor(private readonly ide: Ide) {}

  private get git(): GitServer['cli'] {
    return this.ide.getPlugin<GitServer>(GitServer).cli;
  }

  @command() protected async commit(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { message?: unknown; files?: unknown; amend?: unknown } | null;
    const message = typeof ask?.message === 'string' ? ask.message.trim() : '';
    const files = paths(ask?.files);
    const amend = ask?.amend === true;
    if (message === '') return { error: 'commit message is required' };
    if (files.length === 0) return { error: 'no files selected' };
    const root = call.project.root;
    for (const one of files) call.project.resolve(one);

    const untracked = await this.untracked(root, files);
    if (untracked.length > 0) {
      const added = await this.git.run(root, ['add', '--', ...untracked]);
      if (!added.ok) return { error: added.stderr };
    }
    const args = ['commit', '-m', message, ...(amend ? ['--amend'] : []), '--', ...files];
    const done = await this.git.run(root, args);
    return { error: done.ok ? null : done.stderr };
  }

  @command() protected shelves(_p: unknown, call: CallContext): Promise<ShelfItem[]> {
    return this.shelf.list(call.project.root);
  }

  @command() protected async shelve(params: unknown, call: CallContext): Promise<{ error: string | null; item?: ShelfItem }> {
    const ask = params as { name?: unknown; files?: unknown } | null;
    const files = paths(ask?.files);
    if (files.length === 0) return { error: 'no files selected' };
    const root = call.project.root;
    for (const one of files) call.project.resolve(one);

    const untracked = await this.untracked(root, files);
    if (untracked.length > 0) {
      const marked = await this.git.run(root, ['add', '-N', '--', ...untracked]);
      if (!marked.ok) return { error: marked.stderr };
    }
    const diff = await this.git.run(root, ['diff', '--binary', '--', ...files]);
    if (!diff.ok) return { error: diff.stderr };
    const item = await this.shelf.put(root, String(ask?.name ?? ''), diff.stdout, files);
    if (!item) return { error: 'nothing to shelve: no changes in these files' };

    const tracked = files.filter((one) => !untracked.includes(one));
    if (tracked.length > 0) {
      const back = await this.git.run(root, ['checkout', '--', ...tracked]);
      if (!back.ok) return { error: back.stderr, item };
    }
    if (untracked.length > 0) {
      const forget = await this.git.run(root, ['reset', '--', ...untracked]);
      if (!forget.ok) return { error: forget.stderr, item };
      for (const one of untracked) await fs.rm(path.join(root, one), { force: true });
    }
    return { error: null, item };
  }

  @command() protected async unshelve(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown; keep?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    const root = call.project.root;
    const file = path.join(this.shelf.dirFor(root), `${ask.id}.patch`);
    const applied = await this.git.run(root, ['apply', '--3way', '--', file]);
    if (!applied.ok) return { error: applied.stderr };
    const meta = (await this.shelf.list(root)).find((one) => one.id === ask.id);
    if (meta && meta.files.length > 0) await this.git.run(root, ['reset', '-q', '--', ...meta.files]);
    if (ask.keep !== true) await this.shelf.drop(root, ask.id);
    return { error: null };
  }

  @command() protected async drop(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    await this.shelf.drop(call.project.root, ask.id);
    return { error: null };
  }

  private async untracked(root: string, files: string[]): Promise<string[]> {
    const known = await this.git.run(root, ['ls-files', '--', ...files]);
    if (!known.ok) return [];
    const tracked = new Set(
      known.stdout
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line !== ''),
    );
    return files.filter((one) => !tracked.has(one));
  }
}

function paths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const one of value) {
    if (typeof one !== 'string' || one.trim() === '') continue;
    if (!out.includes(one)) out.push(one);
  }
  return out;
}
