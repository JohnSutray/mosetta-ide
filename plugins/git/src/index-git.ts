import type { Logger } from '@ide/api/server';
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

const DEBOUNCE_MS = 400;

const POLL_MS = 3000;

const COMMON_SHOWN = 5;

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

export class GitIndex {
  private state: GitState = EMPTY;
  private branchList: GitBranch[] = [];
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private queued: Promise<void> | null = null;
  private disposed = false;

  private autoFetch: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly git: GitCli,
    private readonly status: GitStatus,
    private readonly root: string,
    private readonly log: Logger,
    private readonly onChange: (state: GitState) => void,
    private readonly onOutput: (action: GitAction, chunk: string) => void = () => {},
  ) {}

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
          this.log.debug(`автофетч не удался: ${result.stderr}`);
          return;
        }
        return this.refresh();
      });
    }, 30_000);
    this.autoFetch.unref?.();
  }

  snapshot(): GitState {
    return this.state;
  }

  branches(): GitBranch[] {
    return this.branchList;
  }

  start(): void {
    if (this.disposed || this.poll) return;
    void this.refresh();
    this.poll = setInterval(() => void this.refresh(), POLL_MS);
    this.poll.unref?.();
  }

  touch(): void {
    if (this.disposed) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.refresh();
    }, DEBOUNCE_MS);
  }

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
        notRepo ? EMPTY : { ...EMPTY, error: status.stderr || 'git не отвечает' },
      );
      return;
    }

    const files = this.status.parse(status.stdout);
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

  async run(action: GitAction, args: string[]): Promise<string | null> {
    this.onOutput(action, `$ git ${args.join(' ')}\n`);
    const result = await this.git.stream(this.root, args, (chunk) => this.onOutput(action, chunk));
    await this.refresh();
    if (result.ok) {
      this.onOutput(action, '\n[готово]\n');
      return null;
    }
    this.log.warn(`git ${args.join(' ')}: ${result.stderr}`);
    this.onOutput(action, `\n[git отказался: ${result.stderr}]\n`);
    return result.stderr || 'git отказался';
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

function byMark(mark: string): GitFileState {
  if (mark === 'A') return 'added';
  if (mark === 'D') return 'deleted';
  if (mark === 'U') return 'conflict';
  return 'modified';
}
