import type { FindProvider, Found } from '@mosetta/ide-plugin-search/server';

/**
 * Scripts from package.json as a SUPPLIER OF HITS.
 *
 * The row's format is `npm::@distrojs/core::dev`: namespace, package, script. The `::`
 * separator lies in the index's string itself, so a query of `::dev` naturally pulls
 * out the scripts, and `npm::` only them.
 *
 * This parsing used to live in the core, and the index opened `package.json` itself.
 * Now it is the other way round: the index brings the text, and only we know what to do
 * with it. A supplier has no disk reading of its own and should not: the truth for
 * search is memory.
 *
 * A class rather than a couple of functions: the kind and the parsing have one owner,
 * and a test assembles it in one line without bringing up a server or a plugin.
 */
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
