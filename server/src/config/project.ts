import path from 'node:path';
import type { ConfigBundle, Settings, SettingValue } from '@mosetta/ide-protocol';
import { journal } from '../log.js';
import type { WorkspaceResource } from '../workspace/workspace.js';
import type { Workspace } from '../workspace/workspace.js';
import { jsonc } from './jsonc.js';
import { patch } from './patch.js';
import { mergeSettings, type ConfigStore } from './store.js';

const log = journal.logger('config');

/**
 * Project settings live IN THE REPOSITORY: a `.mosetta` directory next to the code,
 * holding a file built exactly like the personal one. So they travel with the project,
 * are visible in git and arrive on a second machine by themselves — none of which the
 * previous arrangement, a key in the personal config, could do.
 */
export const PROJECT_SETTINGS = '.mosetta/settings.json';

/**
 * What the project file does not override.
 *
 * The keymap: a cloned repository must not silently change what your keys do. The
 * plugin set MAY be overridden — a project is entitled to ask for its own tool.
 */
const NOT_FROM_PROJECT = ['keymap'];

/**
 * The project settings layer is a workspace resource: one per project, dying with it.
 *
 * The file is read through the MEMORY LAYER rather than straight off disk: so a hand
 * edit, a `git pull` and a branch switch reach the tabs by themselves, by the same
 * route as any other file of the project.
 */
export class ProjectConfig implements WorkspaceResource {
  private own: Record<string, Record<string, unknown>> = {};
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly ws: Workspace,
    private readonly store: ConfigStore,
  ) {}

  /**
   * Where the file lives: the settings window shows this when it writes into the
   * project.
   */
  get file(): string {
    return path.join(this.ws.root, PROJECT_SETTINGS);
  }

  async load(): Promise<void> {
    await this.reread();
    this.offs.push(
      this.ws.services.ram.on((event) => {
        if (!('path' in event) || event.path !== PROJECT_SETTINGS) return;
        if (event.type === 'doc.opened') return;
        void this.reread().then(() => this.announce());
      }),
    );
  }

  /** THIS tab's effective config: the project layer over the personal one. */
  get bundle(): ConfigBundle {
    const base = this.store.current;
    return {
      ...base,
      settings: mergeSettings(base.settings, this.own as Partial<Settings>),
      project: this.own,
      projectFile: this.file,
    };
  }

  /** Tell this project's tabs that the effective config changed. */
  announce(): void {
    this.ws.broadcast('config.changed', this.bundle);
    for (const listener of this.listeners) listener(this.bundle);
  }

  /**
   * The layer changed — for whoever on the server lives on these settings (the
   * filesystem layers, through the workspace). A mirror of the store's own change hook.
   */
  onChange(listener: (bundle: ConfigBundle) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly listeners = new Set<(bundle: ConfigBundle) => void>();

  /** Write a project value — surgically, as into the personal file. */
  async set(section: string, key: string, value: SettingValue): Promise<{ rewritten: boolean }> {
    const text = (await this.readText()) ?? '';
    const patched = patch.setting(text, section, key, value);
    await this.write(patched.text);
    return { rewritten: patched.rewritten };
  }

  /** Remove a project value; no file means nothing to remove. */
  async unset(section: string, key: string): Promise<void> {
    const text = await this.readText();
    if (text === null) return;
    const patched = patch.unset(text, section, key);
    if (patched.text === text) return;
    await this.write(patched.text);
  }

  /** Whether the project file holds such a key. */
  has(section: string, key: string): boolean {
    return this.own[section]?.[key] !== undefined;
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }

  private async reread(): Promise<void> {
    const text = await this.readText();
    this.own = {};
    if (text === null) return;
    try {
      this.own = jsonc.parse<Record<string, Record<string, unknown>>>(text, PROJECT_SETTINGS) ?? {};
    } catch (err) {
      log.error(`${PROJECT_SETTINGS} did not parse, not applying the project settings: ${String(err)}`);
      return;
    }
    for (const section of NOT_FROM_PROJECT) {
      if (this.own[section] === undefined) continue;
      delete this.own[section];
      log.warn(`${PROJECT_SETTINGS}: section ${section} is never project-scoped — skipping`);
    }
  }

  private async readText(): Promise<string | null> {
    try {
      return (await this.ws.services.ram.peekDoc(PROJECT_SETTINGS)).text;
    } catch {
      return null;
    }
  }

  private async write(text: string): Promise<void> {
    await this.ws.services.os.write(PROJECT_SETTINGS, text);
    await this.ws.services.ram.syncFromDisk([PROJECT_SETTINGS]);
    await this.reread();
    this.announce();
  }
}
