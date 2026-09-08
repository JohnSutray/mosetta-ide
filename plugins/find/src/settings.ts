export interface FindSettings {
  masks: string[];
  masksOff: string[];
  maxHits: number;
}

export const FIND_DEFAULTS: FindSettings = { masks: [], masksOff: [], maxHits: 500 };
