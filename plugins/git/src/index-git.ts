import type { Logger } from '@mosetta/ide-api/server';
import type {
  GitAction,
  GitBranch,
  GitChange,
  GitCommit,
  GitFileState,
  GitState,
  PushPreview,
} from './types.js';
import type { GitCli } from './cli.js';
import type { GitStatus } from './status.js';

/** The pause after an edit: people type faster than git counts. */
const DEBOUNCE_MS = 400;

/**
 * How often we check whether a commit was made past us.
 *
 * The tick is frequent, and the decision to recount is taken on it according to the
 * setting: that way an edit to the settings file takes effect without a restart, and
 * zero switches the poll off on the fly — by the same device the auto-fetch uses.
 */
const TICK_MS = 1000;

/** How many shared commits we show in the push window: enough for a foothold. */
const COMMON_SHOWN = 5;

/** git's empty tree — the base for diffing the repository's first commit. */
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {}, moved: {} };

export class GitIndex {
  private state: GitState = EMPTY;
  private branchList: GitBranch[] = [];
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  /** A recount that will start after the current one: one for everybody waiting. */
  private queued: Promise<void> | null = null;
  private disposed = false;

  private autoFetch: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly git: GitCli,
    private readonly status: GitStatus,
    private readonly root: string,
    private readonly log: Logger,
    private readonly onChange: (state: GitState) => void,
    /** An action's output as it appears — the popup shows it like a terminal. */
    private readonly onOutput: (action: GitAction, chunk: string) => void = () => {},
  ) {}

  /**
   * We go after the remote's updates ourselves.
   *
   * Without that, the arrows next to the branches lie right up until one presses fetch
   * by hand: git does not learn of other people's commits by itself. Quietly — into the
   * log, with no notifications: this is background work rather than an event. A failure
   * (no network, no remote) is quiet too, otherwise we would be shouting about it every
   * ten minutes.
   */
  startAutoFetch(minutesOf: () => number): void {
    if (this.autoFetch) {
      clearInterval(this.autoFetch);
      this.autoFetch = null;
    }
    if (this.disposed) return;
    let last = Date.now();
    this.autoFetch = setInterval(() => {
      const minutes = minutesOf();
      if (minutes <= 0 || Date.now() - last < minutes * 60_000) return;
      last = Date.now();
      void this.git.run(this.root, ['fetch', '--all', '--prune'], 60_000).then((result) => {
        if (!result.ok) {
          this.log.debug(`the auto-fetch did not work out: ${result.stderr}`);
          return;
        }
        return this.refresh();
      });
    }, 30_000);
    this.autoFetch.unref?.();
  }

  /** The snapshot from memory. Instantly and always — even while git is still thinking. */
  snapshot(): GitState {
    return this.state;
  }

  branches(): GitBranch[] {
    return this.branchList;
  }

  start(secondsOf: () => number = () => 3): void {
    if (this.disposed || this.poll) return;
    void this.refresh();
    let last = Date.now();
    this.poll = setInterval(() => {
      const seconds = secondsOf();
      if (seconds <= 0 || Date.now() - last < seconds * 1000) return;
      last = Date.now();
      void this.refresh();
    }, TICK_MS);
    this.poll.unref?.();
  }

  /** Memory changed — recount, but not on every letter. */
  touch(): void {
    if (this.disposed) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.refresh();
    }, DEBOUNCE_MS);
  }

  /**
   * What the file was in the last commit.
   *
   * `HEAD:./path` — the dot is not accidental: without it git counts the path from the
   * REPOSITORY's root, while a project may be opened on a subdirectory, and then we
   * would be reading somebody else's file or nothing. The dot says "from the current
   * directory".
   *
   * Not in the history (a new file, `.gitignore`, not a repository) is not an error but
   * an answer: `null` means "there is nothing to compare with, the file is new whole".
   */
  async headText(key: string): Promise<string | null> {
    const shown = await this.git.run(this.root, ['show', `HEAD:./${key}`]);
    return shown.ok ? shown.stdout : null;
  }

  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      this.queued ??= this.running.then(() => {
        this.queued = null;
        return this.refresh();
      });
      return this.queued;
    }
    this.running = this.doRefresh().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doRefresh(): Promise<void> {
    const status = await this.git.run(this.root, [
      'status',
      '--porcelain',
      '-z',
      '--untracked-files=all',
    ]);

    if (!status.ok) {
      const notRepo = /not a git repository/i.test(status.stderr);
      this.publish(
        notRepo ? EMPTY : { ...EMPTY, error: status.stderr || 'git is not answering' },
      );
      return;
    }

    const { files, moved } = this.status.parse(status.stdout);
    const [head, tracking, branchList] = await Promise.all([
      this.git.run(this.root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      this.git.run(this.root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
      this.readBranches(),
    ]);

    const [ahead, behind] = tracking.ok ? counts(tracking.stdout) : [0, 0];
    this.branchList = branchList;
    this.publish({
      repo: true,
      branch: head.ok ? head.stdout.trim() || null : null,
      ahead,
      behind,
      files,
      moved,
    });
  }

  private async readBranches(): Promise<GitBranch[]> {
    const result = await this.git.run(this.root, [
      'branch',
      '--all',
      '--format=%(refname)\t%(refname:short)\t%(upstream:short)\t%(HEAD)\t%(objectname:short)\t%(upstream:track)\t%(contents:subject)',
    ]);
    if (!result.ok) return [];

    const out: GitBranch[] = [];
    for (const line of result.stdout.split('\n')) {
      if (line.trim() === '') continue;
      const parts = line.split('\t');
      const refname = parts[0] ?? '';
      const name = parts[1] ?? '';
      const upstream = parts[2] ?? '';
      const head = parts[3] ?? '';
      const sha = parts[4] ?? '';
      const track = parts[5] ?? '';
      const subject = parts.slice(6).join('\t');
      if (refname.endsWith('/HEAD')) continue;
      out.push({
        name,
        current: head === '*',
        remote: refname.startsWith('refs/remotes/'),
        ...(upstream ? { upstream } : {}),
        head: sha,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
        ...(subject ? { subject } : {}),
      });
    }
    out.sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      if (a.remote !== b.remote) return a.remote ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  /**
   * What will travel on a push and what will be overwritten by it.
   *
   * Computed ON REQUEST rather than in the background: this is four git calls, and
   * there is no point keeping them in a three-second loop — the push window is opened
   * once an hour.
   */
  async outgoing(): Promise<PushPreview> {
    const head = await this.git.run(this.root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const branch = head.ok ? head.stdout.trim() || null : null;

    const tracking = await this.git.run(this.root, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ]);
    const upstream = tracking.ok ? tracking.stdout.trim() || null : null;

    if (!upstream) {
      const local = await this.commits(['--not', '--remotes', 'HEAD']);
      const common = await this.commits([`-n`, `${COMMON_SHOWN}`, 'HEAD', '--not', ...ids(local)]);
      return { branch, upstream: null, common, remote: [], local };
    }

    const [local, remote, base] = await Promise.all([
      this.commits([`${upstream}..HEAD`]),
      this.commits([`HEAD..${upstream}`]),
      this.git.run(this.root, ['merge-base', 'HEAD', upstream]),
    ]);
    const common = base.ok
      ? await this.commits(['-n', `${COMMON_SHOWN}`, base.stdout.trim()])
      : [];

    return { branch, upstream, common, remote, local };
  }

  /**
   * Which files were touched. Without a commit, the whole outgoing diff; with one, only
   * it.
   *
   * For "everything outgoing" the base is the point of divergence rather than the
   * upstream: otherwise what was done in the remote would get into the list too —
   * whereas we show what travels FROM US.
   */
  async changes(commit?: string): Promise<GitChange[]> {
    if (commit) {
      return this.names(['show', '--name-status', '--format=', commit]);
    }

    const tracking = await this.git.run(this.root, [
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    ]);
    if (tracking.ok && tracking.stdout.trim() !== '') {
      return this.names(['diff', '--name-status', `${tracking.stdout.trim()}...HEAD`]);
    }

    const local = await this.commits(['--not', '--remotes', 'HEAD']);
    const oldest = local[local.length - 1];
    if (!oldest) return [];
    const parent = await this.git.run(this.root, ['rev-parse', `${oldest.short}^`]);
    const base = parent.ok ? parent.stdout.trim() : EMPTY_TREE;
    return this.names(['diff', '--name-status', base, 'HEAD']);
  }

  /** Parsing `--name-status`: a state letter, a tab, a path. */
  private async names(args: string[]): Promise<GitChange[]> {
    const result = await this.git.run(this.root, args);
    if (!result.ok) return [];
    const out: GitChange[] = [];
    for (const line of result.stdout.split('\n')) {
      if (line.trim() === '') continue;
      const [mark = '', first = '', second = ''] = line.split('\t');
      const path = mark.startsWith('R') || mark.startsWith('C') ? second : first;
      if (!path) continue;
      out.push({ path, state: byMark(mark[0] ?? 'M') });
    }
    return out;
  }

  /**
   * Commits in machine format. The records are separated by a ZERO rather than a
   * newline: newlines are an ordinary thing inside a message's body, and one may not
   * parse by them. The fields inside a record are separated by tabs, with the body
   * last.
   */
  private async commits(args: string[]): Promise<GitCommit[]> {
    const result = await this.git.run(this.root, [
      'log',
      '--format=%h%x09%an%x09%ad%x09%s%x09%b%x00',
      '--date=short',
      ...args,
    ]);
    if (!result.ok) return [];
    const out: GitCommit[] = [];
    for (const record of result.stdout.split('\0')) {
      const line = record.replace(/^\n+/, '');
      if (line.trim() === '') continue;
      const parts = line.split('\t');
      const body = parts.slice(4).join('\t').trim();
      out.push({
        short: parts[0] ?? '',
        author: parts[1] ?? '',
        date: parts[2] ?? '',
        subject: parts[3] ?? '',
        ...(body ? { body } : {}),
      });
    }
    return out;
  }

  /**
   * An action on branches. Returns git's complaint, or `null` if it worked.
   *
   * The output is NOT buffered: it flows upwards as it appears, because `fetch`, `pull`
   * and `push` go over the network and take seconds — showing a frozen interface
   * meanwhile is a lie that nothing is happening.
   *
   * There are deliberately no "is this allowed" checks of our own here: git knows its
   * own prohibitions better ("the branch is not merged", "there are uncommitted
   * changes"), and its text is clearer than any retelling of ours.
   */
  async run(action: GitAction, args: string[]): Promise<string | null> {
    this.onOutput(action, `$ git ${args.join(' ')}\n`);
    const result = await this.git.stream(this.root, args, (chunk) => this.onOutput(action, chunk));
    await this.refresh();
    if (result.ok) {
      this.onOutput(action, '\n[done]\n');
      return null;
    }
    this.log.warn(`git ${args.join(' ')}: ${result.stderr}`);
    this.onOutput(action, `\n[git refused: ${result.stderr}]\n`);
    return result.stderr || 'git refused';
  }

  private publish(next: GitState): void {
    if (same(this.state, next)) return;
    this.state = next;
    this.onChange(next);
  }

  dispose(): void {
    this.disposed = true;
    if (this.debounce) clearTimeout(this.debounce);
    if (this.poll) clearInterval(this.poll);
    if (this.autoFetch) clearInterval(this.autoFetch);
    this.debounce = null;
    this.poll = null;
    this.autoFetch = null;
  }}

/** Each commit's `abc123` — so as to exclude them from the shared history. */
function ids(commits: GitCommit[]): string[] {
  return commits.map((commit) => commit.short);
}

function counts(raw: string): [number, number] {
  const [ahead, behind] = raw.trim().split(/\s+/).map(Number);
  return [Number.isFinite(ahead) ? ahead! : 0, Number.isFinite(behind) ? behind! : 0];
}

function same(a: GitState, b: GitState): boolean {
  if (a.repo !== b.repo || a.branch !== b.branch) return false;
  if (a.ahead !== b.ahead || a.behind !== b.behind || a.error !== b.error) return false;
  const ka = Object.keys(a.files);
  const kb = Object.keys(b.files);
  if (ka.length !== kb.length) return false;
  return ka.every((key) => a.files[key] === b.files[key]);
}

/** A `--name-status` letter to a state. The same values as the status uses. */
function byMark(mark: string): GitFileState {
  if (mark === 'A') return 'added';
  if (mark === 'D') return 'deleted';
  if (mark === 'U') return 'conflict';
  return 'modified';
}
