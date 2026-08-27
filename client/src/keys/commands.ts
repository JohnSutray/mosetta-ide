import { COMMAND_IDS, COMMANDS, type CommandId } from '@ide/protocol';
import { stack } from '../state/popups.js';

type Runner = () => void | Promise<void>;

const registry = new Map<string, Runner>();
const pluginTitles = new Map<string, string>();

export function registerCommand(id: CommandId, run: Runner): void {
  registry.set(id, run);
}

export function registerPluginCommand(id: string, title: string, run: Runner): void {
  registry.set(id, run);
  pluginTitles.set(id, title);
}

export function isPluginCommand(id: string): boolean {
  return pluginTitles.has(id);
}

const OPENS: Partial<Record<CommandId, string>> = {
  'search.everywhere': 'search',
  'projects.show': 'projects',
  'git.branches': 'branches',
  'git.push': 'push',
  'keys.show': 'keys',
  'symbol.goto': 'symbols',
  'terminal.shell': 'tool-shell',
  'tools.packageManager': 'tool-manager',
};

export function opensOpenPopup(id: string): boolean {
  const popup = opensPopup(id);
  return popup !== undefined && stack.value.some((item) => item.id === popup);
}

export function runCommand(id: string): boolean {
  const popup = opensPopup(id);
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

export function hasCommand(id: string): boolean {
  return registry.has(id);
}

export function commandTitle(id: string): string {
  return COMMANDS[id as CommandId] ?? pluginTitles.get(id) ?? id;
}

function opensPopup(id: string): string | undefined {
  return OPENS[id as CommandId] ?? (pluginTitles.has(id) ? id : undefined);
}

export function missingCommands(): CommandId[] {
  return COMMAND_IDS.filter((id) => !registry.has(id));
}
