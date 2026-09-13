export interface CompletionSettings {
  auto: boolean;
  words: boolean;
  postfix: boolean;
}

export const COMPLETION_DEFAULTS: CompletionSettings = { auto: true, words: true, postfix: true };

export const COMPLETION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    auto: { type: 'boolean' },
    words: { type: 'boolean' },
    postfix: { type: 'boolean' },
  },
} as const;
