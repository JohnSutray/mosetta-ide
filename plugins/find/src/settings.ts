export interface FindSettings {
  masks: string[];
  maxHits: number;
}

export const FIND_DEFAULTS: FindSettings = { masks: [], maxHits: 500 };
