/**
 * The command registry. Code that knows how to do something registers here and does NOT
 * know which key will call it. Keys, toolbar buttons and a future action palette are
 * three different ways of calling one and the same thing.
 */

type Runner = () => void | Promise<void>;

export class Commands {
  /**
   * The registry is open.
   *
   * The key used to be a closed union from the protocol, and that was true while
   * everything lived in the core. The core now has no commands of its own: every one of
   * them is declared by a plugin, with a `@command` annotation on a method, and naming
   * them all at compile time is impossible.
   */
  private readonly registry = new Map<string, Runner>();

  registerPlugin(id: string, run: Runner): void {
    this.registry.set(id, run);
  }

  run(id: string): boolean {
    const run = this.registry.get(id);
    if (!run) return false;
    void run();
    return true;
  }

  has(id: string): boolean {
    return this.registry.has(id);
  }
}
