import { signal } from '@preact/signals';
import en from './en.json';

export type Strings = Record<string, string>;

export const strings = signal<Strings>(en as Strings);

const missing = new Set<string>();

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
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    params && name in params ? String(params[name]) : whole,
  );
}

export function addStrings(from: string, more: Strings): void {
  const now = { ...strings.value };
  for (const [key, value] of Object.entries(more)) {
    if (key in now && now[key] !== value) {
      console.warn(`[web-ide] ${from}: ключ ${key} уже занят — беру его`);
      continue;
    }
    now[key] = value;
  }
  strings.value = now;
  for (const key of Object.keys(more)) missing.delete(key);
}

export function missingKeys(): string[] {
  return [...missing];
}
