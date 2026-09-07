export interface GitSettings {
  autoFetchMinutes: number;
}

export const GIT_DEFAULTS: GitSettings = { autoFetchMinutes: 10 };
