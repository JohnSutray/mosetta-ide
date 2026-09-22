import { signal } from '@preact/signals';
import { PROJECT_LAYER, USER_LAYER, type SettingsEntry } from '@mosetta/ide-api/client';

/** Which field to draw: the type is inferred from the default. */
export type SettingKind = 'boolean' | 'number' | 'string' | 'choice' | 'list' | 'object';

/**
 * Where a value lives: nowhere (factory), in the personal file, or in the project's.
 * This is also the switch in the row: click a position to move the value there, and
 * `default` to reset it.
 */
export type SettingAt = 'default' | 'user' | 'project';

export interface SettingRow {
  section: string;
  key: string;
  /** The path in the settings file: `section.key`. */
  path: string;
  /** The dictionary key holding the human-readable name: `settings.<section>.<key>`. */
  label: string;
  kind: SettingKind;
  value: unknown;
  /** Factory — the default from the plugin's code. */
  fallback: unknown;
  /** Set somewhere other than in code — then there is something to reset. */
  overridden: boolean;
  /** Which layer the value in force lies in. */
  at: SettingAt;
  options?: readonly string[];
}

export interface SettingGroup {
  /** The owner's package name, or `core`. */
  owner: string;
  /** The owner's name — a dictionary key. */
  title: string;
  rows: SettingRow[];
  /**
   * Its own editor for the section: if there is one, we draw that instead of rows. A
   * "key — field" row will not do for the keymap, so it brings a screen of its own.
   */
  editor?: () => unknown;
}

/**
 * The settings editor's model: from the section declarations, the live config and the
 * user's file — rows grouped by owner. No DOM, hence a test.
 */
export class SettingsModel {
  kindOf(fallback: unknown, options?: readonly string[]): SettingKind {
    if (options?.length) return 'choice';
    if (typeof fallback === 'boolean') return 'boolean';
    if (typeof fallback === 'number') return 'number';
    if (typeof fallback === 'string') return 'string';
    if (Array.isArray(fallback) && fallback.every((one) => typeof one === 'string')) return 'list';
    return 'object';
  }

  /**
   * Rows from the declarations and the LAYERS.
   *
   * The layers arrive from the section's key through the registry, and an entry's
   * author is its layer: the factory one is signed by the plugin, the user's by the
   * personal settings file, the project's by its own. The model no longer knows a
   * separate "what the file says", and it has two fewer sources.
   */
  groups(
    entries: readonly SettingsEntry[],
    layersOf: (section: string) => ReadonlyArray<{ by: string; value: unknown }>,
  ): SettingGroup[] {
    const byOwner = new Map<string, SettingGroup>();
    for (const entry of entries) {
      const group =
        byOwner.get(entry.owner) ??
        ({ owner: entry.owner, title: entry.title, rows: [], ...(entry.editor ? { editor: entry.editor } : {}) } as SettingGroup);
      byOwner.set(entry.owner, group);
      const layers = layersOf(entry.section);
      const from = (layer: string): Record<string, unknown> =>
        (layers.find((one) => one.by === layer)?.value ?? {}) as Record<string, unknown>;
      const own = from(USER_LAYER);
      const theirs = from(PROJECT_LAYER);
      for (const [key, fallback] of Object.entries(entry.defaults as Record<string, unknown>)) {
        const options = entry.fields?.[key]?.options;
        const at: SettingAt = theirs[key] !== undefined ? 'project' : own[key] !== undefined ? 'user' : 'default';
        group.rows.push({
          section: entry.section,
          key,
          path: `${entry.section}.${key}`,
          label: `settings.${entry.section}.${key}`,
          kind: this.kindOf(fallback, options),
          value: theirs[key] ?? own[key] ?? fallback,
          fallback,
          overridden: at !== 'default',
          at,
          options,
        });
      }
    }
    return [...byOwner.values()];
  }

  /** Searching by label and by path; a group with no rows disappears. */
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

  /**
   * Split a label into pieces by what is being searched for: we are going to highlight
   * with a BACKING, and for that we have to know where exactly it matched. No DOM,
   * hence a test.
   */
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

  /**
   * A list of strings from the field: one line, one element, and empty ones do not
   * count.
   */
  lines(text: string): string[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
  }
}

/**
 * The editor window: whether it is open, what is being searched for, and which sections
 * are expanded.
 */
export class SettingsWindow {
  readonly open = signal(false);
  readonly term = signal('');
  /**
   * The expanded sections, by owner. All collapsed by default: a long list is
   * frightening, while a heading with the number of changed values says where to look.
   */
  readonly expanded = signal<ReadonlySet<string>>(new Set());

  toggleGroup(owner: string): void {
    const next = new Set(this.expanded.value);
    if (next.has(owner)) next.delete(owner);
    else next.add(owner);
    this.expanded.value = next;
  }

  /**
   * Whether a section is expanded: while searching, always — otherwise the matches
   * cannot be seen.
   */
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
