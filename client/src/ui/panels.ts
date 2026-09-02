import type { ReadonlySignal } from '@preact/signals';
import type { CommandId } from '@ide/protocol';
import { persisted } from '../state/persist.js';
import type { IconName } from '@ide/ui';

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
  ];
}

export const panels = new Panels();
