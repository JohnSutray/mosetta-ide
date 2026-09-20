/** The `completion` section of the settings file is ours. */
export interface CompletionSettings {
  /**
   * Open the list by itself: on a word's first letter and after a dot. Off means by key
   * only.
   */
  auto: boolean;
  /** The open file's words — insurance where the checker stays silent. */
  words: boolean;
  /** Postfix templates: `expr.log`, `expr.if`, `expr.not`. */
  postfix: boolean;
}

export const COMPLETION_DEFAULTS: CompletionSettings = { auto: true, words: true, postfix: true };

/** The shape of the section's value: the human's file is validated against it. */
export const COMPLETION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    auto: { type: 'boolean' },
    words: { type: 'boolean' },
    postfix: { type: 'boolean' },
  },
} as const;
