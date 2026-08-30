import { session } from '../state/session.js';
import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import { persisted } from '../state/persist.js';

export const treePanelVisible = persisted('panel.tree', true);
export const terminalPanelVisible = persisted('panel.terminal', false);

session.onReset(() => (terminalPanelVisible.value = false));
import type { IconName } from './icons.js';

export type PanelSide = 'left' | 'right';

export interface PanelSpec {
  id: string;
  title: string;
  tooltip: string;
  side: PanelSide;
  icon: IconName;
  command: CommandId;
  open: ReadonlySignal<boolean>;
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
    defaultWidth: 260,
    minWidth: 150,
  },
  {
    id: 'terminal',
    title: 'panel.terminal',
    tooltip: 'toolbar.terminal',
    side: 'right',
    icon: 'terminal',
    command: 'panel.terminal',
    open: terminalPanelVisible,
    defaultWidth: 460,
    minWidth: 240,
  },
];
