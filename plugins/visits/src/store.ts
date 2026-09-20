import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Visit } from './types.js';

/**
 * The file's name: a readable beginning plus a hash of the full path. The beginning so
 * that one can tell by eye whose history it is inside the directory; the hash because
 * everyone has two projects called `client`.
 */
function fileFor(stateDir: string, root: string): string {
  const name = path.basename(root).replace(/[^\w.-]+/g, '_').slice(0, 32) || 'project';
  const hash = createHash('sha1').update(root).digest('hex').slice(0, 12);
  return path.join(stateDir, `${name}-${hash}.json`);
}

function valid(item: unknown): item is Visit {
  if (typeof item !== 'object' || item === null) return false;
  const visit = item as Partial<Visit>;
  if (typeof visit.path !== 'string' || visit.path === '') return false;
  if (typeof visit.line !== 'number') return false;
  return visit.character === undefined || typeof visit.character === 'number';
}

async function exists(root: string, key: string): Promise<boolean> {
  try {
    return (await fs.stat(path.join(root, key))).isFile();
  } catch {
    return false;
  }
}

/**
 * The caret's visit history on disk.
 *
 * It writes outside the project — into the PLUGIN's state directory, which the core
 * supplies (`ide.state`), rather than into a constant. Dead rows — files that no longer
 * exist — are thrown away on reading: a row you jump to and get emptiness from is a
 * trap rather than a memory.
 */
export class VisitsStore {
  /** How many steps we remember. Nobody walks more than thirty back. */
  readonly limit = 30;

  async load(stateDir: string, root: string): Promise<Visit[]> {
    let raw: string;
    try {
      raw = await fs.readFile(fileFor(stateDir, root), 'utf8');
    } catch {
      return [];
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) return [];
    const clean = parsed.filter(valid).slice(-this.limit);
    const alive = await Promise.all(clean.map((visit) => exists(root, visit.path)));
    return clean.filter((_, at) => alive[at]);
  }

  async save(
    stateDir: string,
    root: string,
    visits: Visit[],
  ): Promise<void> {
    const file = fileFor(stateDir, root);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(visits.slice(-this.limit), null, 2), 'utf8');
  }
}
