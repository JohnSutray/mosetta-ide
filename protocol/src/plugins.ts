
export interface PluginManifest {
  name: string;
  version: string;
  client?: string;
  server?: string;
  commands?: Record<string, string>;
  strings?: string;
  needs?: string[];
  provides?: string;
}

export type PluginState = 'ok' | 'building' | 'failed';

export interface PluginInfo {
  name: string;
  version: string;
  state: PluginState;
  hasClient: boolean;
  hasServer: boolean;
  commands: Record<string, string>;
  needs: string[];
  provides?: string;
  strings: Record<string, string>;
  error?: string;
}
