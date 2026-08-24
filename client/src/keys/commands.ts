import { COMMAND_IDS, COMMANDS, type CommandId } from '@ide/protocol';
import { stack } from '../state/popups.js';

type Runner = () => void | Promise<void>;

const registry = new Map<CommandId, Runner>();

export function registerCommand(id: CommandId, run: Runner): void {
  registry.set(id, run);
}

const OPENS: Partial<Record<CommandId, string>> = {
  'search.everywhere': 'search',
  'projects.show': 'projects',
  'scripts.open': 'scripts',
  'git.branches': 'branches',
  'git.push': 'push',
  'keys.show': 'keys',
  'symbol.goto': 'symbols',
  'terminal.shell': 'tool-shell',
  'tools.packageManager': 'tool-manager',
};

export function opensOpenPopup(id: CommandId): boolean {
  const popup = OPENS[id];
  return popup !== undefined && stack.value.some((item) => item.id === popup);
}

export function runCommand(id: CommandId): boolean {
  const popup = OPENS[id];
  const open = popup === undefined ? undefined : stack.value.find((item) => item.id === popup);
  if (open) {
    open.close();
    return true;
  }

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
