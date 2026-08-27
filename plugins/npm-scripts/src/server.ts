
interface Services {
  index: {
    listScripts(): ScriptInfo[];
    findScript(id: string): ScriptInfo | undefined;
  };
  packageManager(): string;
  openTerminal(options: Record<string, unknown>): unknown;
}

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

interface Call {
  services: unknown;
}

export default class NpmScriptsServer {
  declare readonly method: (
    name: string,
    handler: (params: unknown, call: Call) => unknown,
  ) => void;

  activate(): void {
    this.method('list', (_params, call) => this.list(call));
    this.method('run', (params, call) => {
      const asked = params as { id?: unknown; cols?: number; rows?: number } | null;
      if (!asked || typeof asked.id !== 'string') throw new Error('нужен id: string');
      return this.run(asked.id, call, asked.cols, asked.rows);
    });
  }

  list(call: Call): ScriptInfo[] {
    return (call.services as Services).index.listScripts();
  }

  run(id: string, call: Call, cols?: number, rows?: number): unknown {
    const services = call.services as Services;
    const script = services.index.findScript(id);
    if (!script) throw new Error(`нет скрипта ${id}`);

    return services.openTerminal({
      name: script.id,
      kind: 'script',
      command: `${services.packageManager()} run ${script.script}`,
      cwd: parentOf(script.path),
      ...(cols ? { cols } : {}),
      ...(rows ? { rows } : {}),
    });
  }
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
