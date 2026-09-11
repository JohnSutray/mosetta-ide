import type { Ide, RunResult } from '@mosetta/ide-api/server';

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

function said(ran: RunResult, code: number | null): string {
  if (ran.stderr) return ran.stderr;
  return ran.ok ? '' : `git завершился с кодом ${code ?? '?'}`;
}

export class GitCli {
  constructor(private readonly ide: Ide) {}

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
