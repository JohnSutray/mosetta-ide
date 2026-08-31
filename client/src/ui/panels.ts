import { session } from '../state/session.js';
import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import { persisted } from '../state/persist.js';

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

export class Panels {
  readonly tree = persisted('panel.tree', true);
  readonly terminal = persisted('panel.terminal', false);

  constructor() {
    session.onReset(() => (this.terminal.value = false));
  }

  readonly all: PanelSpec[] = [
    {
      id: 'tree',
      title: 'panel.tree',
      tooltip: 'toolbar.tree',
      side: 'left',
      icon: 'tree',
      command: 'panel.tree',
      open: this.tree,
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
      open: this.terminal,
      defaultWidth: 460,
      minWidth: 240,
    },
  ];
}

export const panels = new Panels();
