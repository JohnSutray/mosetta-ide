import { settingsKey, type SettingsEntry } from '@mosetta/ide-api/client';
import type { SettingValue } from '@mosetta/ide-protocol';
import type { Registry } from './registry.js';

export class SettingsWrite {
  constructor(private readonly store: Registry) {}

  complain(section: string, key: string, value: SettingValue, layer: string): string | null {
    const own = this.store.all<SettingsEntry>('settings').value.find((one) => one.section === section);
    if (!own) return `раздел настроек никто не объявил: ${section}`;
    const known = (own.defaults as Record<string, unknown>)[key];
    if (known === undefined) return `такой настройки нет: ${section}.${key}`;
    if (typeof known !== typeof value) return `${section}.${key} ждёт ${typeof known}`;
    const options = own.fields?.[key]?.options;
    if (options && typeof value === 'string' && !options.includes(value)) {
      return `${section}.${key}: «${value}» — не из вариантов ${options.join(', ')}`;
    }
    const where = settingsKey(section);
    const now = this.store.entries<Record<string, unknown>>(where).value.find((one) => one.by === layer)?.value ?? {};
    const bad = this.store.inspect(where, { ...now, [key]: value });
    return bad ? `${section}.${key}: ${bad.why}` : null;
  }
}
