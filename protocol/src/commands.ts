export const COMMANDS = {
  'file.save': 'Сохранить файл',
  'file.reload': 'Перечитать файл с диска',
  'edit.undo': 'Отменить',
  'edit.redo': 'Повторить',
  'panel.tree': 'Панель: дерево проекта',
  'panel.problems': 'Панель: ошибки',
  'panel.scripts': 'Панель: скрипты package.json',
  'panel.terminal': 'Панель: терминал',

  'terminal.create': 'Новый терминал',

  'search.everywhere': 'Найти всё',
  'search.next': 'Поиск: вниз',
  'search.prev': 'Поиск: вверх',
  'search.accept': 'Поиск: открыть',
  'search.close': 'Поиск: закрыть',
} as const;

export type CommandId = keyof typeof COMMANDS;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value);
}
