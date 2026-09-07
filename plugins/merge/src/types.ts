
export type MergeSource = 'fs' | 'git' | 'shelve';

export interface MergeSide {
  label: string;
  text: string | null;
}

export interface MergeFile {
  path: string;
  base: string | null;
  left: MergeSide;
  right: MergeSide;
  done: boolean;
}

export interface MergeSession {
  id: string;
  source: MergeSource;
  title: string;
  files: MergeFile[];
}

export interface MergeSupply {
  source: MergeSource;
  title: string;
  files: MergeFile[];
  apply(path: string, text: string | null): Promise<void>;
  finish?(): Promise<void>;
  cancel?(): Promise<void>;
}
