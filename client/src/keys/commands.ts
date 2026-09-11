import { COMMAND_IDS, COMMANDS, type CommandId } from '@ide/protocol';

type Runner = () => void | Promise<void>;

export class Commands {
  private readonly registry = new Map<string, Runner>();

  register(id: CommandId, run: Runner): void {
    this.registry.set(id, run);
  }

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

  title(id: string): string {
    return COMMANDS[id as CommandId] ?? id;
  }

  missing(): CommandId[] {
    return COMMAND_IDS.filter((id) => !this.registry.has(id));
  }
}
