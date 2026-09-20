
export interface Changelist {
  id: string;
  name: string;
  files: string[];
}

export const DEFAULT_LIST = 'changes';
export const UNRESOLVED_LIST = 'unresolved';
export const RESERVED = [DEFAULT_LIST, UNRESOLVED_LIST];
