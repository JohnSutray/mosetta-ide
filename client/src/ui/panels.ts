import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import {
  problemsPanelVisible,
  scriptsPanelVisible,
  terminalPanelVisible,
  treePanelVisible,
} from '../state/session.js';
import { searchOpen } from '../state/search.js';
import { branchesOpen, pushOpen } from '../state/git.js';
import type { IconName } from './icons.js';

export type PanelSide = 'left' | 'right';

export type PanelToolbar = 'button' | 'chips';

export interface PanelSpec {
  id: string;
  title: string;
  tooltip: string;
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
    title: 'panel.tree',
    tooltip: 'toolbar.tree',
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
    title: 'panel.scripts',
    tooltip: 'toolbar.scripts',
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
    title: 'panel.problems',
    tooltip: 'toolbar.problems',
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
    title: 'panel.terminal',
    tooltip: 'toolbar.terminal',
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
    title: 'toolbar.search',
    icon: 'search',
    command: 'search.everywhere',
    active: searchOpen,
  },
  {
    id: 'git.branches',
    title: 'toolbar.branches',
    icon: 'git',
    command: 'git.branches',
    active: branchesOpen,
  },
  {
    id: 'git.push',
    title: 'toolbar.push',
    icon: 'push',
    command: 'git.push',
    active: pushOpen,
  },
  entryFor('scripts'),
  entryFor('problems'),
  {
    id: 'terminal.create',
    title: 'toolbar.terminal.create',
    icon: 'terminal',
    command: 'terminal.create',
  },
];

function entryFor(id: string): ToolbarEntry {
  const panel = panelButtons.find((item) => item.id === id);
  if (!panel) throw new Error(`нет панели ${id} с кнопкой`);
  return {
    id: panel.id,
    title: panel.tooltip,
    icon: panel.icon,
    command: panel.command,
    active: panel.open,
  };
}
