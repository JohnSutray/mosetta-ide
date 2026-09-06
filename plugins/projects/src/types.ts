
export interface DirSuggestion {
  path: string;
  name: string;
  children?: DirSuggestion[];
}

export interface RecentProject {
  root: string;
  name: string;
  openedAt: number;
}
