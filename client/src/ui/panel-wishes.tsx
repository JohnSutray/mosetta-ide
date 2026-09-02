import { commands } from '../keys/commands.js';
import { Tree } from './tree.js';
import { panels } from './panels.js';
import type { Registry } from '../state/registry.js';

interface PanelWish {
  id: string;
  title: string;
  side: 'left' | 'main' | 'right';
  open: { readonly value: boolean };
  view: () => unknown;
  heading?: () => string | null;
  badges?: () => unknown;
  close?: () => void;
  defaultWidth?: number;
  minWidth?: number;
}

function content(id: string) {
  switch (id) {
    case 'tree':
      return <Tree />;
    default:
      return null;
  }
}

export function registerPanelWishes(store: Registry): void {
  const panel = (wish: PanelWish) => store.add('panel', wish, 'core');

  for (const spec of panels.all) {
    panel({
      id: spec.id,
      title: spec.title,
      side: spec.side,
      open: spec.open,
      view: () => content(spec.id),
      close: () => commands.run(spec.command),
      defaultWidth: spec.defaultWidth,
      minWidth: spec.minWidth,
    });
  }
}
