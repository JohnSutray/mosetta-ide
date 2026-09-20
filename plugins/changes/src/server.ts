import fs from 'node:fs/promises';
import path from 'node:path';
import { command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import GitServer from '@mosetta/ide-plugin-git/server';
import MergeServer from '@mosetta/ide-plugin-merge/server';
import type { MergeFile } from '@mosetta/ide-plugin-merge';
import { Changelists, type Changelist } from './lists.js';
import { Draft } from './draft.js';
import { PatchReader } from './patch.js';
import { Shelf, type ShelfItem } from './shelf.js';

export type { ShelfItem } from './shelf.js';
export type { Changelist } from './lists.js';

export default class ChangesServer {
  private readonly shelf = new Shelf(() => this.ide.state);
  private readonly changelists = new Changelists(() => this.ide.state);
  private readonly draft = new Draft(() => this.ide.state);
  private readonly patches = new PatchReader();
  private readonly signature = new Draft(() => this.ide.state, 'identity', 'json');

  constructor(private readonly ide: Ide) {}

  private get git(): GitServer['cli'] {
    return this.ide.getPlugin<GitServer>(GitServer).cli;
  }

  @command() protected async commit(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { message?: unknown; files?: unknown; amend?: unknown; name?: unknown; email?: unknown } | null;
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
    const who = [
      ...(typeof ask?.name === 'string' && ask.name.trim() !== '' ? ['-c', `user.name=${ask.name.trim()}`] : []),
      ...(typeof ask?.email === 'string' && ask.email.trim() !== '' ? ['-c', `user.email=${ask.email.trim()}`] : []),
    ];
    const args = [...who, 'commit', '-m', message, ...(amend ? ['--amend'] : []), '--', ...files];
    const done = await this.git.run(root, args);
    return { error: done.ok ? null : done.stderr };
  }

  @command() protected lists(_p: unknown, call: CallContext): Promise<Changelist[]> {
    return this.changelists.read(call.project.root);
  }

  @command() protected async listCreate(params: unknown, call: CallContext): Promise<Changelist> {
    const name = String((params as { name?: unknown } | null)?.name ?? '').trim();
    if (name === '') throw new Error('changelist name is required');
    return this.changelists.create(call.project.root, name);
  }

  @command() protected async listRename(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown; name?: unknown } | null;
    const name = String(ask?.name ?? '').trim();
    if (typeof ask?.id !== 'string' || name === '') throw new Error('id and name are required');
    await this.changelists.rename(call.project.root, ask.id, name);
    return { error: null };
  }

  @command() protected async listRemove(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('id is required');
    await this.changelists.remove(call.project.root, ask.id);
    return { error: null };
  }

  @command() protected async listMove(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown; files?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('id is required');
    await this.changelists.move(call.project.root, ask.id, paths(ask.files));
    return { error: null };
  }

  @command() protected async revert(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const files = paths((params as { files?: unknown } | null)?.files);
    if (files.length === 0) return { error: 'no files selected' };
    const root = call.project.root;
    for (const one of files) call.project.resolve(one);

    const untracked = await this.untracked(root, files);
    const tracked = files.filter((one) => !untracked.includes(one));
    if (tracked.length > 0) {
      const back = await this.git.run(root, ['checkout', '--', ...tracked]);
      if (!back.ok) return { error: back.stderr };
    }
    for (const one of untracked) await fs.rm(path.join(root, one), { force: true });
    return { error: null };
  }

  @command() protected async lastMessage(_p: unknown, call: CallContext): Promise<{ text: string }> {
    const done = await this.git.run(call.project.root, ['log', '-1', '--pretty=%B']);
    return { text: done.ok ? done.stdout.replace(/\n+$/, '') : '' };
  }

  @command() protected draftRead(_p: unknown, call: CallContext): Promise<{ text: string }> {
    return this.draft.read(call.project.root).then((text) => ({ text }));
  }

  @command() protected async draftWrite(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    await this.draft.write(call.project.root, String((params as { text?: unknown } | null)?.text ?? ''));
    return { error: null };
  }

  @command() protected async identity(_p: unknown, call: CallContext): Promise<{
    name: string;
    email: string;
    fromGit: { name: string; email: string };
  }> {
    const root = call.project.root;
    const [name, email] = await Promise.all([
      this.git.run(root, ['config', 'user.name']),
      this.git.run(root, ['config', 'user.email']),
    ]);
    const git = {
      name: name.ok ? name.stdout.trim() : '',
      email: email.ok ? email.stdout.trim() : '',
    };
    const own = await this.ownIdentity(root);
    return { name: own.name || git.name, email: own.email || git.email, fromGit: git };
  }

  @command() protected async identityWrite(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { name?: unknown; email?: unknown } | null;
    const own = { name: String(ask?.name ?? '').trim(), email: String(ask?.email ?? '').trim() };
    await this.signature.write(call.project.root, own.name === '' && own.email === '' ? '' : JSON.stringify(own));
    return { error: null };
  }

  private async ownIdentity(root: string): Promise<{ name: string; email: string }> {
    try {
      const raw = JSON.parse(await this.signature.read(root)) as { name?: unknown; email?: unknown };
      return { name: typeof raw.name === 'string' ? raw.name : '', email: typeof raw.email === 'string' ? raw.email : '' };
    } catch {
      return { name: '', email: '' };
    }
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

  @command() protected async unshelve(
    params: unknown,
    call: CallContext,
  ): Promise<{ error: string | null; conflicts?: string[]; restored?: string[] }> {
    const ask = params as { id?: unknown; files?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    const root = call.project.root;
    const file = path.join(this.shelf.dirFor(root), `${ask.id}.patch`);
    const only = paths(ask.files);
    const meta = (await this.shelf.list(root)).find((one) => one.id === ask.id);
    const touched = only.length > 0 ? only : (meta?.files ?? []);

    const busy = (await this.unmerged(root)).filter((one) => touched.includes(one));
    if (busy.length > 0) return { error: `sort out the conflict first: ${busy.join(', ')}` };

    const saved = await this.keepIndex(root, touched);
    const revived = await this.revive(root, file, touched, saved);
    if (revived.error !== null) return { error: revived.error };
    await this.matchIndex(root, touched);
    const applied = await this.git.run(root, [
      'apply',
      '--3way',
      ...only.map((one) => `--include=${one}`),
      '--',
      file,
    ]);

    const stuck = applied.ok ? [] : await this.unmerged(root);
    if (!applied.ok && stuck.length === 0) {
      for (const one of revived.restored) await fs.rm(path.join(root, one), { force: true });
      await this.restoreIndex(root, touched, saved);
      return { error: applied.stderr };
    }
    if (stuck.length > 0) {
      await this.openMerge(call.project, root, stuck, saved);
      return { error: null, conflicts: stuck };
    }
    await this.restoreIndex(root, touched, saved);
    return { error: null, restored: revived.restored.length > 0 ? revived.restored : undefined };
  }

  private async revive(
    root: string,
    file: string,
    touched: string[],
    saved: Map<string, string>,
  ): Promise<{ restored: string[]; error: string | null }> {
    const gone: string[] = [];
    for (const one of touched) {
      if (saved.has(one)) continue;
      try {
        await fs.stat(path.join(root, one));
      } catch {
        gone.push(one);
      }
    }
    if (gone.length === 0) return { restored: [], error: null };

    const patch = this.patches.read(await fs.readFile(file, 'utf8'));
    const restored: string[] = [];
    for (const one of gone) {
      const section = patch.find((each) => each.path === one);
      if (!section?.base) continue;
      const full = await this.git.run(root, ['rev-parse', '--verify', '--quiet', `${section.base.object}^{blob}`]);
      const object = full.stdout.trim();
      if (!full.ok || object === '') {
        return { restored, error: `cannot bring ${one} back: its base blob ${section.base.object} is gone` };
      }
      const put = await this.git.run(root, [
        'update-index',
        '--add',
        '--cacheinfo',
        `${section.base.mode},${object},${one}`,
      ]);
      if (!put.ok) return { restored, error: put.stderr };
      const back = await this.git.run(root, ['checkout', '--', one]);
      if (!back.ok) {
        await this.git.run(root, ['update-index', '--force-remove', '--', one]);
        return { restored, error: back.stderr };
      }
      restored.push(one);
    }
    return { restored, error: null };
  }

  private async keepIndex(root: string, files: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (files.length === 0) return out;
    const shown = await this.git.run(root, ['ls-files', '-s', '-z', '--', ...files]);
    if (!shown.ok) return out;
    for (const entry of shown.stdout.split('\0')) {
      const found = /^(\d{6}) ([0-9a-f]+) 0\t([\s\S]+)$/.exec(entry);
      if (found) out.set(found[3]!, `${found[1]},${found[2]}`);
    }
    return out;
  }

  private async matchIndex(root: string, files: string[]): Promise<void> {
    const real: string[] = [];
    for (const one of files) {
      try {
        await fs.stat(path.join(root, one));
        real.push(one);
      } catch {}
    }
    if (real.length > 0) await this.git.run(root, ['add', '--', ...real]);
  }

  private async restoreIndex(root: string, files: string[], saved: Map<string, string>): Promise<void> {
    const back: string[] = [];
    const gone: string[] = [];
    for (const one of files) {
      const entry = saved.get(one);
      if (entry === undefined) gone.push(one);
      else back.push('--cacheinfo', `${entry},${one}`);
    }
    if (back.length > 0) await this.git.run(root, ['update-index', ...back]);
    if (gone.length > 0) await this.git.run(root, ['update-index', '--force-remove', '--', ...gone]);
  }

  @command() protected async patch(params: unknown, call: CallContext): Promise<{ text: string }> {
    const ask = params as { id?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    return { text: await this.shelf.patchOf(call.project.root, ask.id) };
  }

  @command() protected async patchBase(params: unknown, call: CallContext): Promise<{ text: string | null }> {
    const ask = params as { id?: unknown; path?: unknown } | null;
    if (typeof ask?.id !== 'string' || typeof ask?.path !== 'string') throw new Error('id and path are required');
    const root = call.project.root;
    const section = this.patches
      .read(await this.shelf.patchOf(root, ask.id))
      .find((one) => one.path === ask.path);
    if (!section) return { text: null };
    if (!section.base) return { text: '' };
    const full = await this.git.run(root, ['rev-parse', '--verify', '--quiet', `${section.base.object}^{blob}`]);
    const object = full.stdout.trim();
    if (!full.ok || object === '') return { text: null };
    const shown = await this.git.run(root, ['cat-file', 'blob', object]);
    return { text: shown.ok ? shown.stdout : null };
  }

  @command() protected async write(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { path?: unknown; text?: unknown } | null;
    if (typeof ask?.path !== 'string' || typeof ask?.text !== 'string') {
      throw new Error('path and text are required');
    }
    call.project.resolve(ask.path);
    await call.project.memory.settle(ask.path, ask.text);
    return { error: null };
  }

  @command() protected async shelfRename(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown; name?: unknown } | null;
    const name = String(ask?.name ?? '').trim();
    if (typeof ask?.id !== 'string' || name === '') throw new Error('id and name are required');
    await this.shelf.rename(call.project.root, ask.id, name);
    return { error: null };
  }

  private async unmerged(root: string): Promise<string[]> {
    const status = await this.git.run(root, ['status', '--porcelain', '-z']);
    if (!status.ok) return [];
    const out: string[] = [];
    const tokens = status.stdout.split('\0');
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (!token || token.length < 4) continue;
      const x = token[0]!;
      const y = token[1]!;
      if (x === 'R' || x === 'C') i += 1;
      if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) out.push(token.slice(3));
    }
    return out;
  }

  private async openMerge(
    project: Project,
    root: string,
    stuck: string[],
    saved: Map<string, string>,
  ): Promise<void> {
    const files: MergeFile[] = [];
    for (const path of stuck) {
      const [base, ours, theirs] = await Promise.all([
        this.stage(root, 1, path),
        this.stage(root, 2, path),
        this.stage(root, 3, path),
      ]);
      files.push({
        path,
        base,
        left: { label: 'changes.merge.mine', text: ours },
        right: { label: 'changes.merge.shelved', text: theirs },
        done: false,
      });
    }

    this.ide.getPlugin<MergeServer>(MergeServer).open(root, {
      source: 'shelve',
      title: 'changes.merge.title',
      files,
      apply: async (path: string, text: string | null) => {
        await project.memory.settle(path, text);
        await this.restoreIndex(root, [path], saved);
      },
      cancel: async () => {
        for (const path of stuck) {
          const ours = await this.stage(root, 2, path);
          if (ours !== null) await project.memory.settle(path, ours);
        }
        await this.restoreIndex(root, stuck, saved);
      },
    });
  }

  private async stage(root: string, at: 1 | 2 | 3, path: string): Promise<string | null> {
    const shown = await this.git.run(root, ['show', `:${at}:${path}`]);
    return shown.ok ? shown.stdout : null;
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
