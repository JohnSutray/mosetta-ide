export interface TerminalSettings {
  shell: string;
  args: string[];
}

export const TERMINAL_DEFAULTS: TerminalSettings = { shell: '', args: [] };
