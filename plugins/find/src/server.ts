import { command, type CallContext, type Ide, type ProjectMemory } from '@mosetta/ide-api/server';
import { Grep, type FileHit, type GrepOptions, type GrepResult } from './grep.js';
import { FIND_DEFAULTS } from './settings.js';

export type { FileHit, GrepOptions, GrepResult } from './grep.js';

export interface GrepAsk extends GrepOptions {
  masks: string[];
  excludes?: string[];
  limit?: number;
}

export interface ReplaceAsk extends GrepAsk {
  replacement: string;
  paths?: string[];
}

export interface ReplaceResult {
  files: number;
  replaced: number;
}

export default class FindServer {
  private readonly engine = new Grep();

  constructor(private readonly ide: Ide) {}

  @command() protected async grep(params: unknown, call: CallContext): Promise<GrepResult> {
    const ask = params as GrepAsk;
    const re = this.engine.pattern(ask);
    const limit = ask.limit ?? call.project.settings('find', FIND_DEFAULTS).maxHits;
    const hits: FileHit[] = [];
    let files = 0;
    let truncated = false;
    const skip = { count: 0 };
    if (!re) return { hits, files, total: 0, truncated, skipped: 0 };
    const wanted = this.engine.masks(ask.masks ?? []);
    const unwanted = this.engine.excludes(ask.excludes ?? []);
    for (const path of this.candidates(call.project.memory, wanted, unwanted, skip)) {
      const text = await this.textOf(call.project.memory, path);
      if (text === null) continue;
      const found = this.engine.scan(path, text, re, limit - hits.length + 1);
      if (found.length === 0) continue;
      files += 1;
      if (hits.length + found.length > limit) {
        hits.push(...found.slice(0, limit - hits.length));
        truncated = true;
        break;
      }
      hits.push(...found);
    }
    return { hits, files, total: hits.length, truncated, skipped: skip.count };
  }

  @command() protected async replace(params: unknown, call: CallContext): Promise<ReplaceResult> {
    const ask = params as ReplaceAsk;
    const re = this.engine.pattern(ask);
    if (!re) return { files: 0, replaced: 0 };
    const wanted = this.engine.masks(ask.masks ?? []);
    const unwanted = this.engine.excludes(ask.excludes ?? []);
    const only = ask.paths ? new Set(ask.paths) : null;
    let files = 0;
    let replaced = 0;
    for (const path of this.candidates(call.project.memory, wanted, unwanted, { count: 0 })) {
      if (only && !only.has(path)) continue;
      const text = await this.textOf(call.project.memory, path);
      if (text === null) continue;
      const n = this.engine.count(text, re);
      if (n === 0) continue;
      await call.project.memory.settle(path, this.engine.replace(text, re, ask.replacement, ask.regex));
      files += 1;
      replaced += n;
    }
    return { files, replaced };
  }

  private *candidates(
    memory: ProjectMemory,
    wanted: (path: string) => boolean,
    unwanted: (path: string) => boolean,
    skip: { count: number },
  ): Iterable<string> {
    for (const file of memory.files()) {
      if (!wanted(file.path)) continue;
      if (unwanted(file.path)) {
        skip.count += 1;
        continue;
      }
      yield file.path;
    }
  }

  private async textOf(memory: ProjectMemory, path: string): Promise<string | null> {
    const resident = memory.docSync(path);
    if (resident) return resident.text;
    try {
      return (await memory.peekDoc(path)).text;
    } catch {
      return null;
    }
  }
}
