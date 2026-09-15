
export const BUTTON_SCHEMA = {
  type: 'object',
  required: ['id', 'title', 'command'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    command: { type: 'string' },
    icon: {},
    active: {},
    visible: {},
    badge: {},
  },
  additionalProperties: false,
} as const;

export const WIDGET_SCHEMA = {
  type: 'object',
  required: ['id', 'side'],
  properties: {
    id: { type: 'string' },
    side: { type: 'string', enum: ['left', 'right'] },
    view: {},
    chip: {},
  },
  additionalProperties: false,
} as const;

export interface ToolbarButton {
  id: string;
  title: string;
  command: string;
  icon: (filled: boolean) => unknown;
  active?: { readonly value: boolean };
  visible?: { readonly value: boolean };
  badge?: { readonly value: number };
}

export interface ToolbarChip {
  id?: string;
  icon: unknown;
  tip: string;
  keys?: string[];
  text: unknown;
  more?: unknown;
  tone?: 'plain' | 'warn' | 'bad';
  busy?: boolean;
  onClick?: () => void;
}

export interface ToolbarWidget {
  id: string;
  side: 'left' | 'right';
  view?: () => unknown;
  chip?: () => ToolbarChip | ToolbarChip[] | null;
}
