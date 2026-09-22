import type { Ide, RunResult } from '@mosetta/ide-api/server';

export interface GitResult {
  ok: boolean;
  stdout: string;
  /** What git said on stderr — that is the user explanation of a refusal. */
  stderr: string;
}

/**
 * What a git complaint is made of.
 *
 * The last line is a poor choice: for `checkout` it is "Aborting", for `push` a hint
 * about `git pull`. git itself marks the substance with the words `error:` and
 * `fatal:`, so we take the first such line, and only if there is none, the last
 * non-empty one.
 */
function complaint(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const marked = lines.find((line) => /^(error|fatal|hint):/i.test(line));
  if (marked) return marked.replace(/^(error|fatal|hint):\s*/i, '');
  return lines[lines.length - 1] ?? 'git refused';
}

/**
 * Our own, git-specific part on top of the shared intentions.
 *
 * Reading commands must not take the index lock: otherwise our state poll fights for it
 * with the git a human started by hand in a terminal. This is knowledge about git
 * rather than about launching, so it lives here.
 */
const OPTIONAL_LOCKS = { GIT_OPTIONAL_LOCKS: '0' };

/** An answer to two questions at once: is this our git, and what did it say. */
function said(ran: RunResult, code: number | null): string {
  if (ran.stderr) return ran.stderr;
  return ran.ok ? '' : `git exited with code ${code ?? '?'}`;
}

/**
 * The only place where `git` is launched.
 *
 * git reads the repository itself, so the git axis goes neither into memory nor into
 * the OS layer: it has its own source of truth, the `.git` directory, which our layers
 * know nothing about (it is in `noScan`). This is not a way round the layering rule but
 * another axis: git answers "what changed relative to the history" rather than "what
 * lies on disk".
 *
 * The methods are called `run` and `stream` rather than `git` and `gitStream`: the
 * axis's name is already in the instance, and `gitCli.git(...)` would be a stutter.
 *
 * The launching ITSELF does not live here: the core does it, and we ask through the
 * contract. What left here is the launch plan, the timeout with its kill, and
 * assembling the environment: all of that is a property of LAUNCHING rather than of
 * git. What remains is what really is git: how to understand its complaint, and what to
 * count as a failure.
 */
export class GitCli {
  constructor(private readonly ide: Ide) {}

  /**
   * Launch git and hand the output over AS IT APPEARS.
   *
   * `fetch`, `pull` and `push` go over the network and take seconds: showing a frozen
   * interface meanwhile is a lie that nothing is happening. So they are not buffered
   * but flow into the popup line by line, as in a terminal. git prints its progress to
   * stderr, so both streams go into one.
   *
   * `--progress` itself is added by the caller, and only for the network commands: it
   * is a subcommand's flag rather than git's own, and globally it turns into a usage
   * summary — caught by the branches test.
   *
   * `no-prompts` is about the network: the process has no terminal, and if git or ssh
   * decide to ask for a password there will be nobody to ask. Without it a `push` hangs
   * forever, showing an endless spinner.
   */
  async stream(
    cwd: string,
    args: string[],
    onChunk: (text: string) => void,
    timeoutMs = 120_000,
  ): Promise<GitResult> {
    const ran = await this.ide.stream(
      {
        command: 'git',
        args,
        cwd,
        reason: `git ${args[0] ?? ''}`.trim(),
        wants: ['no-prompts', 'machine-readable', 'user-shell'],
        env: OPTIONAL_LOCKS,
        timeoutMs,
      },
      onChunk,
    );
    return { ok: ran.ok, stdout: '', stderr: ran.ok ? '' : complaint(said(ran, ran.code)) };
  }

  /**
   * Launch git and wait. It never throws: a git failure is a normal answer ("not a
   * repository", "the branch is not merged"), and it has to be shown to the user
   * rather than bringing the request down with it.
   *
   * Sixteen megabytes is not "with room to spare" but a condition: a `git diff` of a
   * large commit has to arrive whole, and an answer silently cut short is
   * indistinguishable from "there are no more changes".
   */
  async run(cwd: string, args: string[], timeoutMs = 15_000): Promise<GitResult> {
    const ran = await this.ide.run({
      command: 'git',
      args,
      cwd,
      reason: `git ${args[0] ?? ''}`.trim(),
      wants: ['no-prompts', 'machine-readable', 'user-shell'],
      env: OPTIONAL_LOCKS,
      timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: ran.ok, stdout: ran.stdout, stderr: said(ran, ran.code).trim() };
  }
}
