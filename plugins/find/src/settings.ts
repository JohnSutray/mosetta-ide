export interface FindSettings {
  masks: string[];
  masksOff: string[];
  maxHits: number;
}

export const FIND_DEFAULTS: FindSettings = { masks: [], masksOff: [], maxHits: 500 };

export const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    masks: { type: 'array', items: { type: 'string' } },
    masksOff: { type: 'array', items: { type: 'string' } },
    maxHits: { type: 'number' },
  },
} as const;
