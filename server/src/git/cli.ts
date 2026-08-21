import { execFile, spawn } from 'node:child_process';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

function askNothing(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: '0',
    LC_ALL: 'C',
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: `${process.env.GIT_SSH_COMMAND ?? 'ssh'} -oBatchMode=yes`,
  };
}

export function gitStream(
  cwd: string,
  args: string[],
  onChunk: (text: string) => void,
  timeoutMs = 120_000,
): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: askNothing(),
    });

    let tail = '';
    const timer = setTimeout(() => {
      onChunk('\n[превышено время ожидания, процесс убит]\n');
      child.kill('SIGKILL');
    }, timeoutMs);
    timer.unref?.();

    const feed = (data: Buffer) => {
      const text = data.toString();
      tail = (tail + text).slice(-2000);
      onChunk(text);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout: '', stderr: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stdout: '', stderr: code === 0 ? '' : complaint(tail) });
    });
  });
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

export function git(cwd: string, args: string[], timeoutMs = 15_000): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout.toString(),
          stderr: (stderr.toString() || (err ? err.message : '')).trim(),
        });
      },
    );
  });
}
