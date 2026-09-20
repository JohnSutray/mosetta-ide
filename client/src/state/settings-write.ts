import { settingsKey, type SettingsEntry } from '@mosetta/ide-api/client';
import type { SettingValue } from '@mosetta/ide-protocol';
import type { Registry } from './registry.js';

/**
 * Whether this setting may be written.
 *
 * There are three checks, and each answers its own question:
 *
 * * whose is it — the section has to have been declared by someone;
 * * is there such a key and is it of the right kind — judged by the declaration's defaults;
 * * will the FILE still fit — judged by the schema of the section's value.
 *
 * The third one did not exist for a while, and it was a hole right in the middle: the
 * schema validated what a human wrote by hand but not what the IDE wrote itself.
 * `typeof` is no substitute — it is the same for a list of strings and a list of
 * numbers, and after such a write the file held exactly what the schema itself would
 * throw out on reading.
 *
 * A class rather than a function: the check has a dependency, the registry, and it
 * arrives through the constructor.
 */
export class SettingsWrite {
  constructor(private readonly store: Registry) {}

  /** Why it may not be written — in words, and naming the field. `null` means it may. */
  complain(section: string, key: string, value: SettingValue, layer: string): string | null {
    const own = this.store.all<SettingsEntry>('settings').value.find((one) => one.section === section);
    if (!own) return `no plugin declared the settings section: ${section}`;
    const known = (own.defaults as Record<string, unknown>)[key];
    if (known === undefined) return `no such setting: ${section}.${key}`;
    if (typeof known !== typeof value) return `${section}.${key} expects ${typeof known}`;
    const options = own.fields?.[key]?.options;
    if (options && typeof value === 'string' && !options.includes(value)) {
      return `${section}.${key}: «${value}» is not one of ${options.join(', ')}`;
    }
    const where = settingsKey(section);
    const now = this.store.entries<Record<string, unknown>>(where).value.find((one) => one.by === layer)?.value ?? {};
    const bad = this.store.inspect(where, { ...now, [key]: value });
    return bad ? `${section}.${key}: ${bad.why}` : null;
  }
}
