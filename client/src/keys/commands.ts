import { COMMAND_IDS, COMMANDS, type CommandId } from '@ide/protocol';
import type { Popups } from '@ide/windows';

type Runner = () => void | Promise<void>;

export class Commands {
  private readonly registry = new Map<string, Runner>();

  private readonly fromPlugin = new Set<string>();

  constructor(private readonly popups: Pick<Popups, 'stack'>) {}

  register(id: CommandId, run: Runner): void {
    this.registry.set(id, run);
  }

  registerPlugin(id: string, run: Runner): void {
    this.registry.set(id, run);
    this.fromPlugin.add(id);
  }

  isPlugin(id: string): boolean {
    return this.fromPlugin.has(id);
  }

  opensOpenPopup(id: string): boolean {
    const popup = this.opensPopup(id);
    return popup !== undefined && this.popups.stack.value.some((item) => item.id === popup);
  }

  run(id: string): boolean {
    const popup = this.opensPopup(id);
    const open =
      popup === undefined ? undefined : this.popups.stack.value.find((item) => item.id === popup);
    if (open) {
      open.close();
      return true;
    }

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

  private opensPopup(id: string): string | undefined {
    return this.fromPlugin.has(id) ? id : undefined;
  }
}
