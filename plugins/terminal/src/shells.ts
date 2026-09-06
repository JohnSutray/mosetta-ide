import fs from 'node:fs';
import path from 'node:path';
import type { ShellChoice, ShellInfo } from './types.js';

export interface ShellSettings {
  shell?: string;
  args?: string[];
}

function sameFile(a: string, b: string): boolean {
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function candidates(): string[] {
  if (process.platform === 'win32') return windowsCandidates();
  const list = [
    process.env.SHELL ?? '',
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh',
    '/usr/bin/fish',
    '/usr/local/bin/fish',
    '/opt/homebrew/bin/fish',
    '/opt/homebrew/bin/bash',
    '/opt/homebrew/bin/zsh',
    '/usr/local/bin/nu',
    '/opt/homebrew/bin/nu',
  ];
  try {
    const text = fs.readFileSync('/etc/shells', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const clean = line.trim();
      if (clean !== '' && !clean.startsWith('#')) list.push(clean);
    }
  } catch {}
  return list;
}

function windowsCandidates(): string[] {
  const root = process.env.SystemRoot ?? 'C:\\Windows';
  const programs = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programsX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  return [
    process.env.COMSPEC ?? path.join(root, 'System32', 'cmd.exe'),
    path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(programs, 'PowerShell', '7', 'pwsh.exe'),
    path.join(programsX86, 'PowerShell', '7', 'pwsh.exe'),
    path.join(programs, 'Git', 'bin', 'bash.exe'),
    path.join(programs, 'Git', 'usr', 'bin', 'bash.exe'),
    path.join(programsX86, 'Git', 'bin', 'bash.exe'),
    path.join(root, 'System32', 'wsl.exe'),
    local === '' ? '' : path.join(local, 'Microsoft', 'WindowsApps', 'pwsh.exe'),
    local === '' ? '' : path.join(local, 'Programs', 'nu', 'nu.exe'),
  ];
}

export class Shells {
  constructor(private readonly which: (name: string) => string | null) {}

  ref(file: string): string {
    const bare = path.basename(file).replace(/\.exe$/i, '');
    const found = this.which(bare);
    return found && sameFile(found, file) ? bare : file;
  }

  resolveShell(value: string): string | null {
    const wanted = value.trim();
    if (wanted === '') return null;
    if (wanted.includes('/') || wanted.includes('\\')) {
      return this.exists(wanted) ? wanted : null;
    }
    return this.which(wanted);
  }

  loginShell(chosen?: ShellSettings): Omit<ShellChoice, 'env'> {
    const picked = chosen?.shell?.trim();
    if (picked) {
      const file = this.resolveShell(picked);
      if (file) {
        const args = chosen?.args?.length ? chosen.args : this.defaultArgs(file);
        return { file, args };
      }
      const fallback = this.systemShell();
      return { ...fallback, problem: picked };
    }
    return this.systemShell();
  }

  private systemShell(): Omit<ShellChoice, 'env'> {
    if (process.platform === 'win32') {
      return { file: process.env.COMSPEC ?? 'powershell.exe', args: [] };
    }
    const file = process.env.SHELL ?? (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    return { file, args: this.defaultArgs(file) };
  }

  defaultArgs(file: string): string[] {
    const name = path.basename(file).toLowerCase().replace(/\.exe$/, '');
    if (['cmd', 'powershell', 'pwsh', 'wsl'].includes(name)) return [];
    if (name === 'nu' || name === 'nushell') return ['-i'];
    return ['-l', '-i'];
  }

  detect(current = this.loginShell().file): ShellInfo[] {
    const seen = new Map<string, ShellInfo>();
    const add = (file: string) => {
      const full = file.trim();
      if (full === '') return;
      const key = process.platform === 'win32' ? full.toLowerCase() : full;
      if (seen.has(key)) return;
      if (!this.exists(full)) return;
      seen.set(key, {
        path: full,
        name: path.basename(full),
        ref: this.ref(full),
        current: sameFile(full, current),
      });
    };

    for (const candidate of candidates()) add(candidate);
    add(current);
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  exists(file: string): boolean {
    try {
      return fs.statSync(file).isFile();
    } catch {
      return false;
    }
  }
}
