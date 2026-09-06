import path from 'node:path';
import { which } from './which.js';

export interface LaunchPlan {
  command: string;
  args: string[];
  shell: boolean;
}

const BATCH = new Set(['.cmd', '.bat']);

function quote(part: string): string {
  if (part === '') return '""';
  if (!/[\s"&|<>^()]/.test(part)) return part;
  return `"${part.replace(/"/g, '\\"')}"`;
}

export class Exec {
  plan(command: string, args: string[]): LaunchPlan {
    if (process.platform !== 'win32') return { command, args, shell: false };

    const resolved = path.isAbsolute(command) ? command : which.onPath(command);
    if (resolved && !BATCH.has(path.extname(resolved).toLowerCase())) {
      return { command: resolved, args, shell: false };
    }

    return { command: quote(command), args: args.map(quote), shell: true };
  }
}

export const exec = new Exec();
