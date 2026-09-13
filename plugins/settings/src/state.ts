import { signal } from '@preact/signals';
import type { SettingsEntry } from '@mosetta/ide-api/client';

export type SettingKind = 'boolean' | 'number' | 'string' | 'choice' | 'list' | 'object';

export type SettingAt = 'default' | 'user' | 'project';

export interface SettingRow {
  section: string;
  key: string;
  path: string;
  label: string;
  kind: SettingKind;
  value: unknown;
  fallback: unknown;
  overridden: boolean;
  at: SettingAt;
  options?: readonly string[];
}

export interface SettingGroup {
  owner: string;
  title: string;
  rows: SettingRow[];
}

export class SettingsModel {
  kindOf(fallback: unknown, options?: readonly string[]): SettingKind {
    if (options?.length) return 'choice';
    if (typeof fallback === 'boolean') return 'boolean';
    if (typeof fallback === 'number') return 'number';
    if (typeof fallback === 'string') return 'string';
    if (Array.isArray(fallback) && fallback.every((one) => typeof one === 'string')) return 'list';
    return 'object';
  }

  groups(
    entries: readonly SettingsEntry[],
    settings: unknown,
    file: Record<string, Record<string, unknown>>,
    project: Record<string, Record<string, unknown>> = {},
  ): SettingGroup[] {
    const live = (settings ?? {}) as Record<string, Record<string, unknown> | undefined>;
    const byOwner = new Map<string, SettingGroup>();
    for (const entry of entries) {
      const group = byOwner.get(entry.owner) ?? { owner: entry.owner, title: entry.title, rows: [] };
      byOwner.set(entry.owner, group);
      for (const [key, fallback] of Object.entries(entry.defaults as Record<string, unknown>)) {
        const own = file[entry.section]?.[key];
        const theirs = project[entry.section]?.[key];
        const options = entry.fields?.[key]?.options;
        const at: SettingAt = theirs !== undefined ? 'project' : own !== undefined ? 'user' : 'default';
        group.rows.push({
          section: entry.section,
          key,
          path: `${entry.section}.${key}`,
          label: `settings.${entry.section}.${key}`,
          kind: this.kindOf(fallback, options),
          value: theirs ?? own ?? live[entry.section]?.[key] ?? fallback,
          fallback,
          overridden: at !== 'default',
          at,
          options,
        });
      }
    }
    return [...byOwner.values()];
  }

  filter(groups: SettingGroup[], term: string, label: (row: SettingRow) => string): SettingGroup[] {
    const needle = term.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.path.toLowerCase().includes(needle) || label(row).toLowerCase().includes(needle)),
      }))
      .filter((group) => group.rows.length > 0);
  }

  split(text: string, term: string): Array<{ text: string; hit: boolean }> {
    const needle = term.trim().toLowerCase();
    if (needle === '') return [{ text, hit: false }];
    const hay = text.toLowerCase();
    const parts: Array<{ text: string; hit: boolean }> = [];
    let at = 0;
    for (;;) {
      const found = hay.indexOf(needle, at);
      if (found < 0) break;
      if (found > at) parts.push({ text: text.slice(at, found), hit: false });
      parts.push({ text: text.slice(found, found + needle.length), hit: true });
      at = found + needle.length;
    }
    if (at < text.length) parts.push({ text: text.slice(at), hit: false });
    return parts.length > 0 ? parts : [{ text, hit: false }];
  }

  lines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
}

export class SettingsWindow {
  readonly open = signal(false);
  readonly term = signal('');
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  toggleGroup(owner: string): void {
    const next = new Set(this.expanded.value);
    if (next.has(owner)) next.delete(owner);
    else next.add(owner);
    this.expanded.value = next;
  }

  isOpen(owner: string): boolean {
    return this.term.value.trim() !== '' || this.expanded.value.has(owner);
  }

  toggle(): void {
    if (this.open.value) this.close();
    else this.open.value = true;
  }

  close(): void {
    this.open.value = false;
    this.term.value = '';
  }
}
