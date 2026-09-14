import { signal } from '@preact/signals';
import en from './en.json';
import ru from './ru.json';

export type Strings = Record<string, string>;

export const DEFAULT_LOCALE = 'en';

export class I18n {
  readonly strings = signal<Strings>(en as Strings);
  readonly locale = signal<string>(DEFAULT_LOCALE);

  private readonly missing = new Set<string>();

  private base: Strings = { ...(en as Strings) };
  private readonly locales = new Map<string, Strings>([['ru', { ...(ru as Strings) }]]);

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

  add(from: string, byLocale: Record<string, Strings>): void {
    for (const [locale, more] of Object.entries(byLocale)) {
      const into = locale === DEFAULT_LOCALE ? this.base : this.localeOf(locale);
      for (const [key, value] of Object.entries(more)) {
        if (locale === DEFAULT_LOCALE && key in into && into[key] !== value) {
          console.warn(`[web-ide] ${from}: ключ ${key} уже занят — беру его`);
          continue;
        }
        into[key] = value;
      }
      if (locale === DEFAULT_LOCALE) for (const key of Object.keys(more)) this.missing.delete(key);
    }
    this.rebuild();
  }

  defaults(strings: Strings): void {
    let changed = false;
    for (const [key, value] of Object.entries(strings)) {
      if (key in this.base) continue;
      this.base[key] = value;
      this.missing.delete(key);
      changed = true;
    }
    if (changed) this.rebuild();
  }

  use(locale: string): void {
    if (this.locale.peek() === locale) return;
    this.locale.value = locale;
    this.rebuild();
  }

  available(): string[] {
    return [DEFAULT_LOCALE, ...[...this.locales.keys()].sort()];
  }

  missingKeys(): string[] {
    return [...this.missing];
  }

  private localeOf(locale: string): Strings {
    let found = this.locales.get(locale);
    if (!found) {
      found = {};
      this.locales.set(locale, found);
    }
    return found;
  }

  private rebuild(): void {
    const locale = this.locale.peek();
    const over = locale === DEFAULT_LOCALE ? undefined : this.locales.get(locale);
    this.strings.value = over ? { ...this.base, ...over } : { ...this.base };
  }
}
