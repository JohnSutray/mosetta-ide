export interface EditorSettings {
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  caretWidth: number;
  ligatures: boolean;
}

export const EDITOR_DEFAULTS: EditorSettings = {
  fontFamily: 'JetBrains Mono',
  fontSize: 13,
  tabSize: 2,
  lineNumbers: true,
  caretWidth: 2,
  ligatures: false,
};

export const EDITOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fontFamily: { type: 'string' },
    fontSize: { type: 'number' },
    tabSize: { type: 'number' },
    lineNumbers: { type: 'boolean' },
    caretWidth: { type: 'number' },
    ligatures: { type: 'boolean' },
  },
} as const;
