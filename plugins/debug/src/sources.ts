import path from 'node:path';
import type { Frame, SourceRef } from './types.js';

/** A frame's source, as DAP named it. */
export interface DapSource {
  name?: string;
  path?: string;
  sourceReference?: number;
  presentationHint?: string;
}

export interface DapFrame {
  id: number;
  name: string;
  source?: DapSource;
  line: number;
  column: number;
  presentationHint?: string;
}

/**
 * The adapter's paths ↔ the project's paths.
 *
 * INTO the adapter a protocol path is expanded by the core (`project.resolve`) — there
 * is one check for going outside the root. OUTWARDS goes an absolute path, and here it
 * is decided whose it is: the project's (it will become a key), somebody else's file on
 * disk, or text that is not on the disk at all.
 */
export class Sources {
  constructor(
    private readonly root: string,
    private readonly resolve: (relative: string) => string,
  ) {}

  toAdapter(key: string): string {
    return this.resolve(key);
  }

  fromAdapter(source: DapSource | undefined): SourceRef | null {
    if (!source) return null;
    if (source.sourceReference && source.sourceReference > 0) {
      return { kind: 'adapter', name: source.path ?? source.name ?? '?', reference: source.sourceReference };
    }
    if (!source.path) return null;
    const relative = path.relative(this.root, source.path);
    if (relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return { kind: 'project', path: relative.split(path.sep).join('/') };
    }
    return { kind: 'file', absolute: source.path };
  }

  frame(frame: DapFrame): Frame {
    const hint = frame.presentationHint ?? frame.source?.presentationHint;
    return {
      id: frame.id,
      name: frame.name,
      source: this.fromAdapter(frame.source),
      line: frame.line,
      column: frame.column,
      faint: hint === 'deemphasize' || hint === 'subtle',
    };
  }

  /** The adapter's absolute path → the project's key, if it is inside. */
  keyOf(absolute: string): string | null {
    const ref = this.fromAdapter({ path: absolute });
    return ref?.kind === 'project' ? ref.path : null;
  }
}
