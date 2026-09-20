import fs from 'node:fs';
import { activate, command, type CallContext, type Ide, type Project } from '@mosetta/ide-api/server';
import SearchServer, { type IndexHit } from '@mosetta/ide-plugin-search/server';
import { PackageManagers, type PackageManagerInfo } from './managers.js';
import { ScriptsInPackageJson } from './scripts.js';
import { TOOLS_DEFAULTS } from './settings.js';
import { scriptId } from './script-id.js';

/**
 * The scripts plugin's server half.
 *
 * The client neither knows nor should know the package manager or the working
 * directory: those are worked out from the lockfile and from where `package.json` lies,
 * i.e. here. The client asks "run this one".
 *
 * The plugin does NOT keep a list of scripts of its own. It declares a supplier and
 * then asks the index — which already watches memory and rebuilds its hits when a
 * `package.json` is edited. A second copy of the same list would have drifted from the
 * first on the first day.
 *
 * `@command` makes a method callable from the client under its own name. The methods
 * are private: the host calls them by name from its own table rather than a neighbour
 * reaching through a class field.
 */

export interface ScriptInfo {
  id: string;
  script: string;
  command: string;
  path: string;
}

/** This plugin's kind of hit. Also the prefix of the search string. */
const KIND = 'npm';

/** What and where to run: the server's answer to "run this one". */
export interface RunPlan {
  /** The terminal's name: also the script's identity. */
  name: string;
  command: string;
  /**
   * The same command IN PIECES: what to run and with what. A terminal needs a string, a
   * debugger needs the executable and the arguments apart, and taking a string back
   * apart on spaces would mean lying about paths containing spaces.
   */
  argv: string[];
  /** The directory RELATIVE to the project root: the core expands it. */
  cwd: string;
}

export default class NpmScriptsServer {
  /**
   * The managers are our knowledge; where they are in the human's PATH comes from the
   * core.
   */
  private readonly managers: PackageManagers;

  constructor(private readonly ide: Ide) {
    this.managers = new PackageManagers((name) => ide.which(name));
  }

  /** What the project itself SUGGESTS running with — by the lockfile in its root. */
  private suggested(project: Project): string {
    return this.managers.suggested((file) => {
      try {
        return fs.statSync(project.resolve(file)).isFile();
      } catch {
        return false;
      }
    });
  }

  /** What to run with: the human's choice from the settings beats the lockfile. */
  private manager(project: Project): string {
    return this.managers.chosen(this.suggested(project), project.settings('tools', TOOLS_DEFAULTS).packageManager);
  }

  @activate() protected start(): void {
    this.ide.getPlugin(SearchServer).find(new ScriptsInPackageJson());
  }

  /** THIS project's index — at a neighbour's. */
  private index(project: Project) {
    return this.ide.getPlugin(SearchServer).indexOf(project);
  }

  /**
   * What to run scripts with: what exists on the machine and what THIS project
   * suggests. The lockfile is about the project, the list about the machine.
   */
  @command('managers') protected listManagers(_params: unknown, call: CallContext): PackageManagerInfo[] {
    return this.managers.detect(
      this.suggested(call.project),
      call.project.settings('tools', TOOLS_DEFAULTS).packageManager,
      call.project.root,
    );
  }

  @command() protected list(_params: unknown, call: CallContext): ScriptInfo[] {
    return this.index(call.project)
      .byKind(KIND)
      .map((hit) => toScript(hit));
  }

  /**
   * WHAT and WHERE to run this script.
   *
   * The terminal used to be opened from here as well: the code reached into the core's
   * innards, because terminals were part of it. Now the terminal is a neighbour, and it
   * is the CLIENT halves that talk to it: the scripts server answers only its own
   * question — which command, in which directory — and opening it is done by whoever
   * knows how to open things.
   *
   * The server halves know nothing about each other in the process, and that is better
   * than before: they have different lifetimes and different projects.
   */
  @command() protected run(params: unknown, call: CallContext): RunPlan {
    const asked = params as { id?: unknown } | null;
    if (!asked || typeof asked.id !== 'string') throw new Error('id: string required');

    const hit = this.index(call.project).oneOf(KIND, asked.id);
    if (!hit) throw new Error(`no such script: ${asked.id}`);
    const script = toScript(hit);

    const manager = this.manager(call.project);
    return {
      name: script.id,
      command: `${manager} run ${script.script}`,
      argv: [manager, 'run', script.script],
      cwd: parentOf(script.path),
    };
  }
}

/**
 * An index hit to a script. Only we have the right to take the `id` apart again: the
 * `package::script` format is ours, and nobody else knows about it.
 */
function toScript(hit: IndexHit): ScriptInfo {
  const id = hit.id ?? '';
  return { id, script: scriptId.scriptOf(id), command: hit.detail ?? '', path: hit.path };
}

function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? '' : path.slice(0, at);
}
