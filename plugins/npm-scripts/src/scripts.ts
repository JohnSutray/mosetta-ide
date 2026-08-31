import type { FindProvider, Found } from '@ide/api/server';

export class ScriptsInPackageJson implements FindProvider {
  readonly kind = 'npm';

  wants(path: string): boolean {
    return baseName(path) === 'package.json';
  }

  finds(path: string, text: string): Found[] {
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

    const out: Found[] = [];
    for (const [script, command] of Object.entries(scripts as Record<string, unknown>)) {
      if (typeof command !== 'string') continue;
      const id = `${packageName}::${script}`;
      out.push({ label: id, id, detail: command, path });
    }
    return out;
  }
}

function baseName(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? path : path.slice(at + 1);
}

function directoryOf(path: string): string {
  const at = path.lastIndexOf('/');
  if (at === -1) return '';
  const dir = path.slice(0, at);
  const last = dir.lastIndexOf('/');
  return last === -1 ? dir : dir.slice(last + 1);
}
