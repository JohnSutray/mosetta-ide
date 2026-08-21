import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import { problemsPanelVisible, scriptsPanelVisible, terminalPanelVisible, treePanelVisible } from '../state/session.js';
import { searchOpen } from '../state/search.js';
import type { IconName } from './icons.js';

export interface ToolbarEntry {
  id: string;
  title: string;
  icon: IconName;
  command: CommandId;
  active?: ReadonlySignal<boolean>;
}

export const PANELS = [
  {
    id: 'tree',
    title: 'Дерево проекта',
    icon: 'tree' as IconName,
    command: 'panel.tree' as CommandId,
    open: treePanelVisible,
  },
  {
    id: 'scripts',
    title: 'Скрипты package.json',
    icon: 'scripts' as IconName,
    command: 'panel.scripts' as CommandId,
    open: scriptsPanelVisible,
  },
  {
    id: 'problems',
    title: 'Ошибки',
    icon: 'problems' as IconName,
    command: 'panel.problems' as CommandId,
    open: problemsPanelVisible,
  },
  {
    id: 'terminal',
    title: 'Панель терминала',
    icon: 'terminal' as IconName,
    command: 'panel.terminal' as CommandId,
    open: terminalPanelVisible,
  },
] as const;

export const TOOLBAR: ToolbarEntry[] = [
  ...PANELS.map((panel) => ({
    id: panel.id,
    title: panel.title,
    icon: panel.icon,
    command: panel.command,
    active: panel.open,
  })),
  {
    id: 'search',
    title: 'Найти всё (двойной Shift)',
    icon: 'search',
    command: 'search.everywhere',
    active: searchOpen,
  },
  {
    id: 'manual-terminal',
    title: 'Новый ручной терминал',
    icon: 'terminal',
    command: 'terminal.manual',
  },
];
