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

/**
 * The changes panel's server half: the commit and the shelf.
 *
 * There is no git of our own here: git is run by ONE class in the whole IDE — the
 * neighbour's `GitCli` — and we take it through the instance. The knowledge of how git
 * grumbles, and why reading commands must not take the index's lock, belongs to the git
 * plugin rather than to us.
 *
 * What belongs to us: which files the human has ticked, what will go into the commit,
 * and what the shelf looks like.
 */
export default class ChangesServer {
  private readonly shelf = new Shelf(() => this.ide.state);
  private readonly changelists = new Changelists(() => this.ide.state);
  private readonly draft = new Draft(() => this.ide.state);
  private readonly patches = new PatchReader();
  /** The commit's signature, if the human has replaced it with one of their own. */
  private readonly signature = new Draft(() => this.ide.state, 'identity', 'json');

  constructor(private readonly ide: Ide) {}

  private get git(): GitServer['cli'] {
    return this.ide.getPlugin<GitServer>(GitServer).cli;
  }

  /**
   * A commit of the TICKED files rather than of the index.
   *
   * `git commit -- <paths>` takes the working tree of those paths past the index —
   * exactly what WebStorm does with its changelists. We do not touch the index as a
   * matter of principle: it is shared with the human working in the terminal next door,
   * and quietly moving its contents about would be stealing their state.
   *
   * There is one exception, and it is unavoidable: git does not see an untracked file
   * at all until it has been told `add`. So ticked new files are added — but only
   * those, and only the ones that were ticked.
   */
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

  /** What lists there are. The reserved ones always, and first. */
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

  /**
   * Revert files to the commit.
   *
   * What is tracked is brought back by `checkout`, what is untracked is deleted by hand
   * — for the same reason as with the shelf: `checkout` for a file git knows only as an
   * "intent to add" would bring it back EMPTY, and the human would decide they had lost
   * the text.
   *
   * Asking for consent is the client's job: it is the client that knows what to show
   * the human, and it is the client that draws the dangerous button.
   */
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

  /**
   * The last commit's message — it is edited on `--amend`. Empty if there are no
   * commits yet: an empty history has nothing to correct, and silence here is more
   * honest than an invented line.
   */
  @command() protected async lastMessage(_p: unknown, call: CallContext): Promise<{ text: string }> {
    const done = await this.git.run(call.project.root, ['log', '-1', '--pretty=%B']);
    return { text: done.ok ? done.stdout.replace(/\n+$/, '') : '' };
  }

  /** This PROJECT's draft message: it survives a reload of the tab. */
  @command() protected draftRead(_p: unknown, call: CallContext): Promise<{ text: string }> {
    return this.draft.read(call.project.root).then((text) => ({ text }));
  }

  @command() protected async draftWrite(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    await this.draft.write(call.project.root, String((params as { text?: unknown } | null)?.text ?? ''));
    return { error: null };
  }

  /**
   * What the commit is signed with.
   *
   * We ask git itself (`git config user.name`): it folds the local config together with
   * the global one anyway, and there is no point setting up a second rule about the
   * order of layers. On top of that comes the human's replacement, if they have written
   * one in: it is THIS working tree's household and lives next to the draft.
   *
   * Empty in both is no small thing: `git commit` in that state refuses to work, and
   * the panel is obliged to say so BEFORE the press.
   */
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

  /** What lies on this project's shelf, freshest first. */
  @command() protected shelves(_p: unknown, call: CallContext): Promise<ShelfItem[]> {
    return this.shelf.list(call.project.root);
  }

  /**
   * Put the ticked things aside: the patch onto the shelf, the working tree back.
   *
   * The order here is the safety: first we TAKE the patch and make sure it is not
   * empty, then we write it to disk, and only then do we touch the working tree. The
   * reverse order would mean that a failure halfway wipes out work without a trace.
   *
   * A new file gets into the patch through `add -N` — an "intent to add": without it
   * `git diff` does not see the untracked at all, and it would quietly stay where it
   * was, pretending to have been put aside.
   */
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

  /**
   * Take it off the shelf. `--3way` is no whim: the patch is applied to a tree that has
   * moved on since, and the three-way mode can put a change in beside somebody else's.
   *
   * Applying does NOT CHANGE THE SHELF AT ALL: the entry stays as it was, and it can be
   * applied as many times as you like. Hence the whole ritual around `apply` as well:
   * it works THROUGH the index and requires the tree and the index to agree. Before,
   * they did not — which meant "does not match index" instead of an application, and
   * the human got it in exactly two cases: on the second attempt, and on a file they
   * had already edited. So the index is TAKEN OFF and PUT BACK: we bring it together
   * with the tree for the duration of the application, and then put back exactly what
   * was there.
   */
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

  /**
   * Bring back into the tree the files that are no longer in it.
   *
   * This is done ENTIRELY by git: we put the preimage into the index by the object from
   * the patch (`update-index --cacheinfo`) and take it out of there into the tree
   * (`checkout`). We would not rewrite the patch with our own hands — applying has
   * always been git's mechanics rather than ours; our business is only to name the
   * object.
   *
   * What is not in the patch cannot be resurrected: a preimage thrown away by garbage
   * collection is a refusal in words rather than a silent "not in the index" from git's
   * depths.
   */
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

  /**
   * A snapshot of the index's entries for these paths: `<path> → "<mode>,<object>"`.
   *
   * We read `ls-files -s` rather than "let us remember what was changed": the index is
   * not a "yes/no" state but contents, and it can only be put back as the same
   * contents. A path is not in the snapshot — which means it was not in the index, and
   * what has to be put back is precisely that absence.
   */
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

  /**
   * Bring the index together with the tree for these paths — the condition for `--3way`
   * to work.
   *
   * We prepare only what LIES ON THE DISK. We deliberately do not put an absence into
   * the index: a deleted but still tracked file is the one case where git already has
   * the preimage, and it will bring the file back itself. Put a deletion in there and
   * instead of a return you get "not in the index" (measured, and `add -A` was a trap
   * of our own making).
   */
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

  /** Put the index back into what it was: an entry back, an absence back too. */
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

  /**
   * The patch's text: what is put aside is shown by it.
   *
   * We hand it over as it is, and the client parses it: the `git diff` format is
   * knowledge about showing an edit, and it lives where the rest of the diff lives.
   */
  @command() protected async patch(params: unknown, call: CallContext): Promise<{ text: string }> {
    const ask = params as { id?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    return { text: await this.shelf.patchOf(call.project.root, ask.id) };
  }

  /**
   * The text the patch was computed FROM.
   *
   * The view needs it: while the patch fits onto today's commit, "how it was" is taken
   * from there — the human looks at their own edit in today's words. And when the
   * commit has moved on there was nothing to show at all, and that is untrue: the edit
   * is lying on the shelf after all. The preimage is named in the patch itself (`index
   * <was>..<became>`) and lies in the object store — which means "how it was" is always
   * there, as long as the object is alive.
   *
   * An empty string is for a new file: there was nothing before it, and that is not a
   * refusal. `null` means the preimage is lost, and that is said in words.
   */
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

  /**
   * Put a file's text down — through the MEMORY layer.
   *
   * Reverting a hunk in the diff viewer needs this: closed files are shown there too,
   * and a closed one has no document — which means there is nobody to write it but the
   * memory. An open file does not go through this door: its text is changed by the
   * document plugin, and the edit stays UNSAVED, as with a revert from the git strip.
   */
  @command() protected async write(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { path?: unknown; text?: unknown } | null;
    if (typeof ask?.path !== 'string' || typeof ask?.text !== 'string') {
      throw new Error('path and text are required');
    }
    call.project.resolve(ask.path);
    await call.project.memory.settle(ask.path, ask.text);
    return { error: null };
  }

  /** Rename a shelf entry: the name is the only human thing in it. */
  @command() protected async shelfRename(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown; name?: unknown } | null;
    const name = String(ask?.name ?? '').trim();
    if (typeof ask?.id !== 'string' || name === '') throw new Error('id and name are required');
    await this.shelf.rename(call.project.root, ask.id, name);
    return { error: null };
  }

  /** Which files git considers unmerged RIGHT NOW: a `U` in either column. */
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

  /**
   * Set up an ARGUMENT over the shelf's conflicts.
   *
   * We take the triples from the INDEX rather than from the markers in the file: git
   * has already laid them out by stages — `:1:` the common ancestor, `:2:` ours, `:3:`
   * the shelf's. Parsing `<<<<<<<` would mean writing a second parser for what we
   * already have ready-made.
   */
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

  /**
   * An index stage: `1` the ancestor, `2` ours, `3` somebody else's. No stage — no
   * side.
   */
  private async stage(root: string, at: 1 | 2 | 3, path: string): Promise<string | null> {
    const shown = await this.git.run(root, ['show', `:${at}:${path}`]);
    return shown.ok ? shown.stdout : null;
  }

  /**
   * Remove an entry from the shelf for good. The patch cannot be restored — the client
   * asks.
   */
  @command() protected async drop(params: unknown, call: CallContext): Promise<{ error: string | null }> {
    const ask = params as { id?: unknown } | null;
    if (typeof ask?.id !== 'string') throw new Error('shelf id is required');
    await this.shelf.drop(call.project.root, ask.id);
    return { error: null };
  }

  /**
   * Which of these paths git does not know yet. We ask git itself (`ls-files
   * --error-unmatch`): we have a snapshot of the state, but it is computed in the
   * background, and at the moment of a commit it may be a second older than the truth.
   */
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

/** The paths from the client: strings only, non-empty only, with no repeats. */
function paths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const one of value) {
    if (typeof one !== 'string' || one.trim() === '') continue;
    if (!out.includes(one)) out.push(one);
  }
  return out;
}
