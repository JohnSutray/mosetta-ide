import { signal } from '@preact/signals';
import en from './en.json';
import { CLIP_LABEL, MOD_LABEL } from '../keys/host.js';

export type Strings = Record<string, string>;

export const strings = signal<Strings>(en as Strings);

const missing = new Set<string>();

function always(): Record<string, string> {
  return { mod: MOD_LABEL, clip: CLIP_LABEL };
}

export function t(key: string, params?: Record<string, string | number>): string {
  const template = strings.value[key];
  if (template === undefined) {
    if (!missing.has(key)) {
      missing.add(key);
      console.warn(`[web-ide] нет перевода: ${key}`);
    }
    return key;
  }
  if (!template.includes('{')) return template;
  const all = { ...always(), ...params };
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in all ? String(all[name]) : whole,
  );
}

export function missingKeys(): string[] {
  return [...missing];
}
