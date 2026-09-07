export interface TerminalSettings {
  shell: string;
  args: string[];
  fontFamily: string;
}

export const TERMINAL_DEFAULTS: TerminalSettings = { shell: '', args: [], fontFamily: '' };
