import { signal } from '@preact/signals';
import en from './en.json';
import ru from './ru.json';

/**
 * Labels are data rather than strings in code.
 *
 * The same thought as with keys and settings: the interface should not know how it
 * sounds.
 *
 * THERE ARE TWO LANGUAGE LAYERS, and that is the main thing here. English is underneath
 * — it is COMPLETE, and it is the language the repository is written in: every label
 * has to exist in English. The chosen language sits on top and is allowed to have
 * holes; whatever it lacks shows through in English. So a translation can start at any
 * string and never be finished, and the interface does not break for it.
 *
 * A key missing entirely shows the key itself. Not emptiness and not invented text: a
 * hole in the dictionary has to be visible rather than silently swallowed.
 */

export type Strings = Record<string, string>;

/** The default language: also the one the repository is written in. */
export const DEFAULT_LOCALE = 'en';

export class I18n {
  readonly strings = signal<Strings>(en as Strings);
  /** Which language is chosen. Changed by a setting, and visible at once. */
  readonly locale = signal<string>(DEFAULT_LOCALE);

  /**
   * Words still missing: visible in the log rather than in silence. Counted against the
   * BASE, since a missing translation is not a hole but a "not translated yet", and
   * complaining about it would mean complaining on every start.
   */
  private readonly missing = new Set<string>();

  /**
   * The base and the translations are kept apart: switching language rebuilds the
   * visible dictionary from them rather than demanding a reload.
   */
  private base: Strings = { ...(en as Strings) };
  private readonly locales = new Map<string, Strings>([['ru', { ...(ru as Strings) }]]);

  t(key: string, params?: Record<string, string | number>): string {
    const template = this.strings.value[key];
    if (template === undefined) {
      if (!this.missing.has(key)) {
        this.missing.add(key);
        console.warn(`[web-ide] no translation: ${key}`);
      }
      return key;
    }
    if (!template.includes('{')) return template;
    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
      params && name in params ? String(params[name]) : whole,
    );
  }

  /**
   * Pour in somebody else's labels — a plugin's dictionaries.
   *
   * A plugin brings its own keys, and they live on equal terms with ours. A key
   * collision is not something one may keep quiet about: two plugins naming a key alike
   * would simply overwrite each other, with nobody to blame.
   *
   * Collisions are checked against the BASE: the same key in a translation is not a
   * collision but a translation, and there is nothing to complain about.
   */
  add(from: string, byLocale: Record<string, Strings>): void {
    for (const [locale, more] of Object.entries(byLocale)) {
      const into = locale === DEFAULT_LOCALE ? this.base : this.localeOf(locale);
      for (const [key, value] of Object.entries(more)) {
        if (locale === DEFAULT_LOCALE && key in into && into[key] !== value) {
          console.warn(`[web-ide] ${from}: key ${key} is already taken — taking this one`);
          continue;
        }
        into[key] = value;
      }
      if (locale === DEFAULT_LOCALE) for (const key of Object.keys(more)) this.missing.delete(key);
    }
    this.rebuild();
  }

  /**
   * Default labels from a plugin's passport: key → English text.
   *
   * Quietly, and only into the holes. That is the whole difference from `add`: there, a
   * key collision is an error to be said out loud; here it is business as usual. A
   * dictionary file exists precisely in order to override what was declared in code.
   */
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

  /** Which language to show. An unknown one means English, not emptiness. */
  use(locale: string): void {
    if (this.locale.peek() === locale) return;
    this.locale.value = locale;
    this.rebuild();
  }

  /** The languages something exists for: the setting offers these. */
  available(): string[] {
    return [DEFAULT_LOCALE, ...[...this.locales.keys()].sort()];
  }

  /** What was missing over the session — for a future check of the dictionary. */
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
