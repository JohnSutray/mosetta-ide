import type { KeyHost } from '@ide/protocol';

export const HOST: KeyHost =
  typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)
    ? 'electron'
    : 'browser';

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

export const MOD_IS_META = IS_MAC && HOST === 'electron';

export const MOD_LABEL = MOD_IS_META ? 'Cmd' : 'Ctrl';

export const CLIP = IS_MAC && !MOD_IS_META ? 'cmd' : 'mod';

export const CLIP_LABEL = IS_MAC ? 'Cmd' : 'Ctrl';

export function humanizeKey(key: string): string {
  return key
    .split('+')
    .map((part) => {
      if (part === 'mod') return MOD_LABEL;
      if (part === 'clip') return CLIP_LABEL;
      if (part === 'shift') return 'Shift';
      if (part === 'alt') return IS_MAC ? 'Option' : 'Alt';
      if (part === 'ctrl') return 'Control';
      if (part === 'cmd') return 'Cmd';
      if (part === 'backquote') return '`';
      return part.length === 1 ? part.toUpperCase() : part;
    })
    .join('+');
}
