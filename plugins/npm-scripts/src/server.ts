import { activate, command, type CallContext, type Ide } from '@ide/api/server';
import type { IndexHit } from '@ide/protocol';
import { ScriptsInPackageJson } from './scripts.js';
import { scriptId } from './script-id.js';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

const KIND = 'npm';

export interface RunPlan {
  name: string;
  command: string;
  cwd: string;
}

interface Services {
  index: {
    byKind(kind: string): IndexHit[];
    oneOf(kind: string, id: string): IndexHit | undefined;
  };
  packageManager(): string;
}

export default class NpmScriptsServer {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.find(new ScriptsInPackageJson());
  }

  @command() protected list(_params: unknown, call: CallContext): ScriptInfo[] {
    return services(call)
      .index.byKind(KIND)
      .map((hit) => toScript(hit));
  }

  @command() protected run(params: unknown, call: CallContext): RunPlan {
    const asked = params as { id?: unknown } | null;
    if (!asked || typeof asked.id !== 'string') throw new Error('нужен id: string');

    const hit = services(call).index.oneOf(KIND, asked.id);
    if (!hit) throw new Error(`нет скрипта ${asked.id}`);
    const script = toScript(hit);

    return {
      name: script.id,
      command: `${services(call).packageManager()} run ${script.script}`,
      cwd: parentOf(script.path),
    };
  }
}

function toScript(hit: IndexHit): ScriptInfo {
  const id = hit.id ?? '';
  return { id, script: scriptId.scriptOf(id), command: hit.detail ?? '', path: hit.path };
}

function services(call: CallContext): Services {
  return call.services as Services;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
