import { processes, type Ran } from '../env/processes.js';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function complaint(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const marked = lines.find((line) => /^(error|fatal|hint):/i.test(line));
  if (marked) return marked.replace(/^(error|fatal|hint):\s*/i, '');
  return lines[lines.length - 1] ?? 'git отказался';
}

const OPTIONAL_LOCKS = { GIT_OPTIONAL_LOCKS: '0' };

function said(ran: Ran, code: number | null): string {
  if (ran.stderr) return ran.stderr;
  return ran.ok ? '' : `git завершился с кодом ${code ?? '?'}`;
}

export class GitCli {
  async stream(
    cwd: string,
    args: string[],
    onChunk: (text: string) => void,
    timeoutMs = 120_000,
  ): Promise<GitResult> {
    const ran = await processes.stream(
      {
        command: 'git',
        args,
        cwd,
        owner: cwd,
        reason: `git ${args[0] ?? ''}`.trim(),
        wants: ['no-prompts', 'machine-readable', 'user-shell'],
        env: OPTIONAL_LOCKS,
        timeoutMs,
      },
      onChunk,
    );
    return { ok: ran.ok, stdout: '', stderr: ran.ok ? '' : complaint(said(ran, ran.code)) };
  }

  async run(cwd: string, args: string[], timeoutMs = 15_000): Promise<GitResult> {
    const ran = await processes.run({
      command: 'git',
      args,
      cwd,
      owner: cwd,
      reason: `git ${args[0] ?? ''}`.trim(),
      wants: ['no-prompts', 'machine-readable', 'user-shell'],
      env: OPTIONAL_LOCKS,
      timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: ran.ok, stdout: ran.stdout, stderr: said(ran, ran.code).trim() };
  }
}

export const gitCli = new GitCli();
