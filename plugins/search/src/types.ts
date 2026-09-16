
export type IndexKind = string;

export const OWN_KINDS = ['file', 'ts'] as const;

export interface IndexHit {
  kind: IndexKind;
  label: string;
  path: string;
  line?: number;
  detail?: string;
  detailKey?: string;
  id?: string;
  score: number;
  matches: number[];
}

export interface SearchStats {
  files: number;
  provided: number;
  symbols: number;
  vocabulary: number;
  pending: number;
  unparsed: number;
}

export interface SearchAnswer {
  hits: IndexHit[];
  total: number;
}

export interface Found {
  label: string;
  path?: string;
  line?: number;
  detail?: string;
  id?: string;
}

export interface FindProvider {
  kind: string;
  wants(path: string): boolean;
  finds(path: string, text: string): Found[];
}

export interface Opener {
  kind: IndexKind;
  open(found: { path: string; id?: string }): void;
}

export const OPENER_SCHEMA = {
  type: 'object',
  required: ['kind', 'open'],
  additionalProperties: false,
  properties: { kind: { type: 'string' }, open: {} },
} as const;

export interface Recent {
  kind: IndexKind;
  places(limit: number): Array<{ path: string; line?: number; detail?: string }>;
}

export interface SearchSource {
  id: string;
  kind: IndexKind;
  find(query: string, limit: number): Promise<IndexHit[]> | IndexHit[];
  note?(): { key: string; params?: Record<string, string | number>; setting?: string } | null;
}

export const SOURCE_SCHEMA = {
  type: 'object',
  required: ['id', 'kind', 'find'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, kind: { type: 'string' }, find: {}, note: {} },
} as const;

export interface KindIcon {
  kind: IndexKind;
  icon(hit: IndexHit): unknown;
}

export const ICON_SCHEMA = {
  type: 'object',
  required: ['kind', 'icon'],
  additionalProperties: false,
  properties: { kind: { type: 'string' }, icon: {} },
} as const;

export const RECENT_SCHEMA = {
  type: 'object',
  required: ['kind', 'places'],
  additionalProperties: false,
  properties: { kind: { type: 'string' }, places: {} },
} as const;

export interface FileViewLike {
  id: string;
  opens(path: string): boolean;
  text?: boolean;
  view(file: { path: string; text: string }, editor: () => unknown): unknown;
}
