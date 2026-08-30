
export const PANEL_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'side', 'open', 'view'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    side: { type: 'string', enum: ['left', 'main', 'right'] },
    open: {},
    view: {},
    heading: {},
    badges: {},
    close: {},
    defaultWidth: { type: 'number', minimum: 80 },
    minWidth: { type: 'number', minimum: 80 },
  },
  additionalProperties: false,
} as const;

export interface PanelWish {
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
