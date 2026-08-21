import type { GitAction, GitBranch, GitFileState, GitState } from '@ide/protocol';
import type { Logger } from '../log.js';
import { git, gitStream } from './cli.js';

const DEBOUNCE_MS = 400;

const POLL_MS = 3000;

const EMPTY: GitState = { repo: false, branch: null, ahead: 0, behind: 0, files: {} };

export class GitIndex {
  private state: GitState = EMPTY;
  private branchList: GitBranch[] = [];
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private disposed = false;

  constructor(
    private readonly root: string,
    private readonly log: Logger,
    private readonly onChange: (state: GitState) => void,
    private readonly onOutput: (action: GitAction, chunk: string) => void = () => {},
  ) {}

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

  async refresh(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.doRefresh().finally(() => {
      this.running = null;
      if (this.again && !this.disposed) {
        this.again = false;
        void this.refresh();
      }
    });
    return this.running;
  }

  private async doRefresh(): Promise<void> {
    const status = await git(this.root, [
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

    const files = parseStatus(status.stdout);
    const [head, tracking, branchList] = await Promise.all([
      git(this.root, ['rev-parse', '--abbrev-ref', 'HEAD']),
      git(this.root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']),
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
    const result = await git(this.root, [
      'branch',
      '--all',
      '--format=%(refname)\t%(refname:short)\t%(upstream:short)\t%(HEAD)\t%(objectname:short)\t%(contents:subject)',
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
      const subject = parts.slice(5).join('\t');
      if (refname.endsWith('/HEAD')) continue;
      out.push({
        name,
        current: head === '*',
        remote: refname.startsWith('refs/remotes/'),
        ...(upstream ? { upstream } : {}),
        head: sha,
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

  async run(action: GitAction, args: string[]): Promise<string | null> {
    this.onOutput(action, `$ git ${args.join(' ')}\n`);
    const result = await gitStream(this.root, args, (chunk) => this.onOutput(action, chunk));
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
    this.debounce = null;
    this.poll = null;
  }
}

export function parseStatus(raw: string): Record<string, GitFileState> {
  const files: Record<string, GitFileState> = {};
  const tokens = raw.split('\0');
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token || token.length < 4) continue;
    const x = token[0]!;
    const y = token[1]!;
    const path = token.slice(3);
    if (x === 'R' || x === 'C') i += 1;
    files[path] = classify(x, y);
  }
  return files;
}

function classify(x: string, y: string): GitFileState {
  if (x === '?' && y === '?') return 'untracked';
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflict';
  }
  if (x === 'D' || y === 'D') return 'deleted';
  if (x === 'A') return 'added';
  return 'modified';
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
