export const COMMANDS = {
  'file.save': 'Сохранить файл',
  'file.reload': 'Перечитать файл с диска',
  'edit.undo': 'Отменить',
  'edit.redo': 'Повторить',
  'panel.tree': 'Панель: дерево проекта',
  'panel.problems': 'Панель: ошибки',
  'scripts.open': 'Скрипты package.json',
  'panel.terminal': 'Панель: терминал',

  'terminal.create': 'Новый терминал',

  'projects.show': 'Открывашка проектов',
  'projects.next': 'Проекты: вниз по подсказкам',
  'projects.prev': 'Проекты: вверх по подсказкам',
  'projects.suggest': 'Проекты: показать папки текущей папки',
  'projects.complete': 'Проекты: дописать путь',
  'projects.accept': 'Проекты: открыть',
  'projects.close': 'Проекты: вернуться к дереву',

  'git.branches': 'Ветки git',
  'git.push': 'Push текущей ветки',
  'git.fetch': 'Забрать обновления удалёнки',
  'pick.next': 'Список: вниз',
  'pick.prev': 'Список: вверх',
  'pick.accept': 'Список: выбрать',
  'pick.expand': 'Список: раскрыть действия',

  'popup.close': 'Закрыть верхний попап',

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
