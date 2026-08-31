import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ShellInfo, TerminalSettings } from '@ide/protocol';
import { tools } from './tools.js';

export interface ShellChoice {
  file: string;
  args: string[];
  problem?: string;
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
  ref(file: string): string {
    const bare = path.basename(file).replace(/\.exe$/i, '');
    const found = tools.onPath(bare);
    return found && sameFile(found, file) ? bare : file;
  }

  resolveShell(value: string): string | null {
    const wanted = value.trim();
    if (wanted === '') return null;
    if (wanted.includes('/') || wanted.includes('\\')) {
      return this.exists(wanted) ? wanted : null;
    }
    return tools.onPath(wanted);
  }

  loginShell(chosen?: Partial<TerminalSettings>): ShellChoice {
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

  private systemShell(): ShellChoice {
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
      try {
        if (!fs.statSync(full).isFile()) return;
      } catch {
        return;
      }
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

  terminalEnv(extra: Record<string, string> = {}): Record<string, string> {
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

  homeDirectory(): string {
    return os.homedir();
  }
}

export const shells = new Shells();
