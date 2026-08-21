export const COMMANDS = {
  'file.save': 'Сохранить файл',
  'file.reload': 'Перечитать файл с диска',
  'edit.undo': 'Отменить',
  'edit.redo': 'Повторить',
  'panel.tree': 'Панель: дерево проекта',
  'panel.problems': 'Панель: ошибки',
} as const;

export type CommandId = keyof typeof COMMANDS;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value);
}
