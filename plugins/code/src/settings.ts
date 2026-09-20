/**
 * How to show code — the `editor` section of the settings file. It lives with the code
 * display rather than with the editor: the previews live on it too — search, symbols,
 * merging — while the editor merely declares the section its own and writes into it. It
 * is handed to neighbours as a permit: a constant rather than behaviour.
 */
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

/** The shape of the section's value: the human's file is validated against it. */
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
