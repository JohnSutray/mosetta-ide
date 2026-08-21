import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import {
  problemsPanelVisible,
  scriptsPanelVisible,
  terminalPanelVisible,
  treePanelVisible,
} from '../state/session.js';
import { searchOpen } from '../state/search.js';
import type { IconName } from './icons.js';

export type PanelSide = 'left' | 'right';

export type PanelToolbar = 'button' | 'chips';

export interface PanelSpec {
  id: string;
  title: string;
  side: PanelSide;
  icon: IconName;
  command: CommandId;
  open: ReadonlySignal<boolean>;
  toolbar: PanelToolbar;
  defaultWidth: number;
  minWidth: number;
}

export const PANELS: PanelSpec[] = [
  {
    id: 'tree',
    title: 'Дерево проекта',
    side: 'left',
    icon: 'tree',
    command: 'panel.tree',
    open: treePanelVisible,
    toolbar: 'button',
    defaultWidth: 260,
    minWidth: 150,
  },
  {
    id: 'scripts',
    title: 'Скрипты package.json',
    side: 'right',
    icon: 'scripts',
    command: 'panel.scripts',
    open: scriptsPanelVisible,
    toolbar: 'button',
    defaultWidth: 300,
    minWidth: 180,
  },
  {
    id: 'problems',
    title: 'Ошибки',
    side: 'right',
    icon: 'problems',
    command: 'panel.problems',
    open: problemsPanelVisible,
    toolbar: 'button',
    defaultWidth: 360,
    minWidth: 200,
  },
  {
    id: 'terminal',
    title: 'Терминал',
    side: 'right',
    icon: 'terminal',
    command: 'panel.terminal',
    open: terminalPanelVisible,
    toolbar: 'chips',
    defaultWidth: 460,
    minWidth: 240,
  },
];

export interface ToolbarEntry {
  id: string;
  title: string;
  icon: IconName;
  command: CommandId;
  active?: ReadonlySignal<boolean>;
}

const panelButtons = PANELS.filter((panel) => panel.toolbar === 'button');

export const TOOLBAR: ToolbarEntry[] = [
  entryFor('tree'),
  {
    id: 'search',
    title: 'Найти всё (двойной Shift)',
    icon: 'search',
    command: 'search.everywhere',
    active: searchOpen,
  },
  entryFor('scripts'),
  entryFor('problems'),
  {
    id: 'terminal.create',
    title: 'Новый терминал',
    icon: 'terminal',
    command: 'terminal.create',
  },
];

function entryFor(id: string): ToolbarEntry {
  const panel = panelButtons.find((item) => item.id === id);
  if (!panel) throw new Error(`нет панели ${id} с кнопкой`);
  return {
    id: panel.id,
    title: panel.title,
    icon: panel.icon,
    command: panel.command,
    active: panel.open,
  };
}
