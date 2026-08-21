import { COMMAND_IDS, COMMANDS, type CommandId } from '@ide/protocol';

type Runner = () => void | Promise<void>;

const registry = new Map<CommandId, Runner>();

export function registerCommand(id: CommandId, run: Runner): void {
  registry.set(id, run);
}

export function runCommand(id: CommandId): boolean {
  const run = registry.get(id);
  if (!run) return false;
  void run();
  return true;
}

export function hasCommand(id: CommandId): boolean {
  return registry.has(id);
}

export function commandTitle(id: CommandId): string {
  return COMMANDS[id];
}

export function missingCommands(): CommandId[] {
  return COMMAND_IDS.filter((id) => !registry.has(id));
}
