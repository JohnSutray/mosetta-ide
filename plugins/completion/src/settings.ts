export interface CompletionSettings {
  auto: boolean;
  words: boolean;
  postfix: boolean;
}

export const COMPLETION_DEFAULTS: CompletionSettings = { auto: true, words: true, postfix: true };
