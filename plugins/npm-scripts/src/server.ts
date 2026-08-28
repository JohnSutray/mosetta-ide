import { command, type CallContext } from '@ide/api/server';

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

interface Services {
  index: {
    listScripts(): ScriptInfo[];
    findScript(id: string): ScriptInfo | undefined;
  };
  packageManager(): string;
  openTerminal(options: Record<string, unknown>): unknown;
}

export default class NpmScriptsServer {
  @command() private list(_params: unknown, call: CallContext): ScriptInfo[] {
    return services(call).index.listScripts();
  }

  @command() private run(params: unknown, call: CallContext): unknown {
    const asked = params as { id?: unknown; cols?: number; rows?: number } | null;
    if (!asked || typeof asked.id !== 'string') throw new Error('нужен id: string');

    const script = services(call).index.findScript(asked.id);
    if (!script) throw new Error(`нет скрипта ${asked.id}`);

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

function services(call: CallContext): Services {
  return call.services as Services;
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
