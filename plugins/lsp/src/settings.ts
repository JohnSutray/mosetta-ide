export interface LspServerSettings {
  enabled: boolean;
  command: string;
  args: string[];
  extensions: string[];
  checkExtensions?: string[];
  preferences?: Record<string, unknown>;
}

export interface LspSettings {
  startOnOpen: boolean;
  checkProject: boolean;
  checkProjectLimit: number;
  servers: Record<string, LspServerSettings>;
  projects: Record<string, Record<string, Record<string, unknown>>>;
}

export const LSP_DEFAULTS: LspSettings = {
  startOnOpen: true,
  checkProject: true,
  checkProjectLimit: 2000,
  servers: {},
  projects: {},
};
