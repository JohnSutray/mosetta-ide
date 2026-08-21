
export interface NpmScript {
  id: string;
  packageName: string;
  script: string;
  command: string;
  path: string;
}

export function parseScripts(path: string, text: string): NpmScript[] {
  let json: { name?: unknown; scripts?: unknown };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    return [];
  }
  const scripts = json.scripts;
  if (!scripts || typeof scripts !== 'object') return [];

  const packageName =
    typeof json.name === 'string' && json.name.trim() !== ''
      ? json.name
      : directoryOf(path) || '.';

  const out: NpmScript[] = [];
  for (const [script, command] of Object.entries(scripts as Record<string, unknown>)) {
    if (typeof command !== 'string') continue;
    out.push({
      id: `${packageName}::${script}`,
      packageName,
      script,
      command,
      path,
    });
  }
  return out;
}

function directoryOf(path: string): string {
  const at = path.lastIndexOf('/');
  if (at === -1) return '';
  const dir = path.slice(0, at);
  const last = dir.lastIndexOf('/');
  return last === -1 ? dir : dir.slice(last + 1);
}
