import { activate, command, type CallContext, type Ide } from '@ide/api/server';
import type { IndexHit } from '@ide/protocol';
import { ScriptsInPackageJson, scriptOf } from './scripts.js';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

const KIND = 'npm';

interface Services {
  index: {
    byKind(kind: string): IndexHit[];
    oneOf(kind: string, id: string): IndexHit | undefined;
  };
  packageManager(): string;
  openTerminal(options: Record<string, unknown>): unknown;
}

export default class NpmScriptsServer {
  constructor(private readonly ide: Ide) {}

  @activate() private start(): void {
    this.ide.find(new ScriptsInPackageJson());
  }

  @command() private list(_params: unknown, call: CallContext): ScriptInfo[] {
    return services(call)
      .index.byKind(KIND)
      .map((hit) => toScript(hit));
  }

  @command() private run(params: unknown, call: CallContext): unknown {
    const asked = params as { id?: unknown; cols?: number; rows?: number } | null;
    if (!asked || typeof asked.id !== 'string') throw new Error('нужен id: string');

    const hit = services(call).index.oneOf(KIND, asked.id);
    if (!hit) throw new Error(`нет скрипта ${asked.id}`);
    const script = toScript(hit);

    return services(call).openTerminal({
      name: script.id,
      kind: 'script',
      command: `${services(call).packageManager()} run ${script.script}`,
      cwd: parentOf(script.path),
      ...(asked.cols ? { cols: asked.cols } : {}),
      ...(asked.rows ? { rows: asked.rows } : {}),
    });
  }
}

function toScript(hit: IndexHit): ScriptInfo {
  const id = hit.id ?? '';
  return { id, script: scriptOf(id), command: hit.detail ?? '', path: hit.path };
}

function services(call: CallContext): Services {
  return call.services as Services;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
