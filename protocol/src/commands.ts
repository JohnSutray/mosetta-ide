export const COMMANDS = {
  'file.save': 'Сохранить файл',
  'file.reload': 'Перечитать файл с диска',
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
  'nav.back': 'Назад по местам каретки',
  'nav.forward': 'Вперёд по местам каретки',
  'edit.indent': 'Отступ вправо',
  'edit.unindent': 'Отступ влево',
  'panel.tree': 'Панель: дерево проекта',
  'panel.editor': 'Панель редактора',
  'panel.problems': 'Панель: ошибки',
  'scripts.open': 'Скрипты package.json',
  'panel.terminal': 'Панель: терминал',

  'terminal.create': 'Новый терминал',
  'terminal.shell': 'Чем запускать терминал',
  'tools.packageManager': 'Чем запускать скрипты',

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

  'menu.next': 'Меню: вниз',
  'menu.prev': 'Меню: вверх',
  'menu.accept': 'Меню: выбрать',

  'popup.close': 'Закрыть верхний попап',

  'prompt.confirm': 'Модалка: подтвердить',

  'tree.next': 'Дерево: вниз',
  'tree.prev': 'Дерево: вверх',
  'tree.expand': 'Дерево: раскрыть или войти',
  'tree.collapse': 'Дерево: свернуть или выйти',

  'tree.newFile': 'Дерево: новый файл',
  'tree.newFolder': 'Дерево: новая папка',
  'tree.open': 'Дерево: открыть и уйти в редактор',
  'tree.rename': 'Дерево: переименовать',
  'tree.delete': 'Дерево: удалить',
  'tree.copy': 'Дерево: копировать',
  'tree.cut': 'Дерево: вырезать',
  'tree.paste': 'Дерево: вставить',
  'tree.copyPath': 'Дерево: скопировать путь',
  'tree.reveal': 'Дерево: показать в файловом менеджере',
  'tree.follow': 'Дерево: следовать за кареткой',

  'search.everywhere': 'Найти всё',
  'search.next': 'Поиск: вниз',
  'search.prev': 'Поиск: вверх',
  'search.accept': 'Поиск: открыть',
  'search.close': 'Поиск: закрыть',

  'keys.show': 'Все клавиши',

  'key.reserved': 'Занято: пока ничего не делает',
} as const;

export type CommandId = keyof typeof COMMANDS;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value);
}
