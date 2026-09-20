import { command, plugin, type Ide } from '@mosetta/ide-api/client';
import NpmScripts from '@mosetta/ide-plugin-npm-scripts';

/**
 * Re-running the last script.
 *
 * This is also where the crossover gets proven. Look at the import of the neighbour: it
 * is ORDINARY, and yet it does not drag in a second copy — plugin packages are external
 * to one another just as preact is, and at build time they are substituted with the
 * live class.
 *
 * From which the main convenience follows: `getPlugin(NpmScripts)` returns
 * `NpmScripts`. The class is both the KEY and the TYPE here, so the call below is typed
 * and a typo in a method name is caught by the compiler — not by the runtime, and not
 * by a human.
 *
 * And what is visible from here is exactly what the neighbour made public: `run`,
 * `scripts`, `refresh`. Neither its services nor its conversation with the server
 * appear in the completion list — they are private.
 */
@plugin({ title: 'plugin.rerun' })
export default class Rerun {
  private last: string | null = null;

  constructor(private readonly ide: Ide) {}

  @command('scripts.rerun')
  protected rerun(): void {
    const npm = this.ide.getPlugin(NpmScripts);
    const id = this.last ?? npm.scripts()[0]?.id ?? null;
    if (!id) {
      this.ide.say(this.ide.t('rerun.nothing'));
      return;
    }
    this.last = id;
    void npm.run(id);
  }

  /** A neighbour may find it useful too: what we consider the last one. */
  remember(id: string): void {
    this.last = id;
  }
}
