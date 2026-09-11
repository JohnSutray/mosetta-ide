import { signal } from '@preact/signals';
import en from './en.json';

export type Strings = Record<string, string>;

export class I18n {
  readonly strings = signal<Strings>(en as Strings);

  private readonly missing = new Set<string>();

  t(key: string, params?: Record<string, string | number>): string {
    const template = this.strings.value[key];
    if (template === undefined) {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        console.warn(`[web-ide] нет перевода: ${key}`);
      }
      return key;
    }
    if (!template.includes('{')) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      params && name in params ? String(params[name]) : whole,
    );
  }

  add(from: string, more: Strings): void {
    const now = { ...this.strings.value };
    for (const [key, value] of Object.entries(more)) {
      if (key in now && now[key] !== value) {
        console.warn(`[web-ide] ${from}: ключ ${key} уже занят — беру его`);
        continue;
      }
      now[key] = value;
    }
    this.strings.value = now;
    for (const key of Object.keys(more)) this.missing.delete(key);
  }

  missingKeys(): string[] {
    return [...this.missing];
  }
}
