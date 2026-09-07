export const COMMANDS = {
  'edit.undo': 'Отменить',
  'edit.redo': 'Повторить',
  'edit.deleteLine': 'Удалить строку',
  'edit.duplicateLine': 'Продублировать строку',
  'edit.toggleComment': 'Закомментировать',
  'edit.moveLineUp': 'Поднять строку',
  'edit.moveLineDown': 'Опустить строку',
  'edit.addCursorAbove': 'Курсор выше',
  'edit.addCursorBelow': 'Курсор ниже',
  'edit.wordLeft': 'Каретка на слово влево',
  'edit.wordRight': 'Каретка на слово вправо',
  'edit.selectWordLeft': 'Выделить слово слева',
  'edit.selectWordRight': 'Выделить слово справа',
  'symbol.goto': 'К объявлению или к использованиям',
  'edit.indent': 'Отступ вправо',
  'edit.unindent': 'Отступ влево',
  'panel.editor': 'Панель редактора',

  'pick.next': 'Список: вниз',
  'pick.prev': 'Список: вверх',
  'pick.accept': 'Список: выбрать',
  'pick.expand': 'Список: раскрыть действия',

  'menu.next': 'Меню: вниз',
  'menu.prev': 'Меню: вверх',
  'menu.accept': 'Меню: выбрать',

  'popup.close': 'Закрыть верхний попап',

  'key.reserved': 'Занято: пока ничего не делает',
} as const;

export type CommandId = keyof typeof COMMANDS;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value);
}
