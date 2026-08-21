import os from 'node:os';

export interface ShellChoice {
  file: string;
  args: string[];
}

export function loginShell(): ShellChoice {
  if (process.platform === 'win32') {
    return { file: process.env.COMSPEC ?? 'powershell.exe', args: [] };
  }
  const file = process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
  return { file, args: ['-l', '-i'] };
}

export function terminalEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') env[key] = value;
  }
  return {
    ...env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '1',
    ...extra,
  };
}

export function homeDirectory(): string {
  return os.homedir();
}

export function packageManager(has: (file: string) => boolean): string {
  if (has('pnpm-lock.yaml')) return 'pnpm';
  if (has('yarn.lock')) return 'yarn';
  if (has('bun.lockb')) return 'bun';
  return 'npm';
}
