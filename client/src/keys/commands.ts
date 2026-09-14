
type Runner = () => void | Promise<void>;

export class Commands {
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
