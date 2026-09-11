import fs from 'node:fs';
import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import SearchServer, { type IndexHit } from '@mosetta/ide-plugin-search/server';
import { PackageManagers, type PackageManagerInfo } from './managers.js';
import { ScriptsInPackageJson } from './scripts.js';
import { TOOLS_DEFAULTS } from './settings.js';
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

export default class NpmScriptsServer {
  private readonly managers: PackageManagers;

  constructor(private readonly ide: Ide) {
    this.managers = new PackageManagers((name) => ide.which(name));
  }

  private suggested(project: Project): string {
    return this.managers.suggested((file) => {
      try {
        return fs.statSync(project.resolve(file)).isFile();
      } catch {
        return false;
      }
    });
  }

  private manager(project: Project): string {
    return this.managers.chosen(this.suggested(project), this.ide.settings('tools', TOOLS_DEFAULTS).packageManager);
  }

  @activate() protected start(): void {
    this.ide.getPlugin(SearchServer).find(new ScriptsInPackageJson());
  }

  private index(project: Project) {
    return this.ide.getPlugin(SearchServer).indexOf(project);
  }

  @command('managers') protected listManagers(_params: unknown, call: CallContext): PackageManagerInfo[] {
    return this.managers.detect(
      this.suggested(call.project),
      this.ide.settings('tools', TOOLS_DEFAULTS).packageManager,
      call.project.root,
    );
  }

  @command() protected list(_params: unknown, call: CallContext): ScriptInfo[] {
    return this.index(call.project)
      .byKind(KIND)
      .map((hit) => toScript(hit));
  }

  @command() protected run(params: unknown, call: CallContext): RunPlan {
    const asked = params as { id?: unknown } | null;
    if (!asked || typeof asked.id !== 'string') throw new Error('нужен id: string');

    const hit = this.index(call.project).oneOf(KIND, asked.id);
    if (!hit) throw new Error(`нет скрипта ${asked.id}`);
    const script = toScript(hit);

    return {
      name: script.id,
      command: `${this.manager(call.project)} run ${script.script}`,
      cwd: parentOf(script.path),
    };
  }
}

function toScript(hit: IndexHit): ScriptInfo {
  const id = hit.id ?? '';
  return { id, script: scriptId.scriptOf(id), command: hit.detail ?? '', path: hit.path };
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
