import path from 'node:path';
import type { ConfigBundle, Settings, SettingValue } from '@mosetta/ide-protocol';
import { journal } from '../log.js';
import type { WorkspaceResource } from '../workspace/workspace.js';
import type { Workspace } from '../workspace/workspace.js';
import { jsonc } from './jsonc.js';
import { patch } from './patch.js';
import { mergeSettings, type ConfigStore } from './store.js';

const log = journal.logger('config');

export const PROJECT_SETTINGS = '.mosetta/settings.json';

const NOT_FROM_PROJECT = ['keymap'];

export class ProjectConfig implements WorkspaceResource {
  private own: Record<string, Record<string, unknown>> = {};
  private readonly offs: Array<() => void> = [];

  constructor(
    private readonly ws: Workspace,
    private readonly store: ConfigStore,
  ) {}

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

  get bundle(): ConfigBundle {
    const base = this.store.current;
    return {
      ...base,
      settings: mergeSettings(base.settings, this.own as Partial<Settings>),
      project: this.own,
      projectFile: this.file,
    };
  }

  announce(): void {
    this.ws.broadcast('config.changed', this.bundle);
    for (const listener of this.listeners) listener(this.bundle);
  }

  onChange(listener: (bundle: ConfigBundle) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private readonly listeners = new Set<(bundle: ConfigBundle) => void>();

  async set(section: string, key: string, value: SettingValue): Promise<{ rewritten: boolean }> {
    const text = (await this.readText()) ?? '';
    const patched = patch.setting(text, section, key, value);
    await this.write(patched.text);
    return { rewritten: patched.rewritten };
  }

  async unset(section: string, key: string): Promise<void> {
    const text = await this.readText();
    if (text === null) return;
    const patched = patch.unset(text, section, key);
    if (patched.text === text) return;
    await this.write(patched.text);
  }

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
      log.error(`${PROJECT_SETTINGS} не разобран, проектные настройки не применяю: ${String(err)}`);
      return;
    }
    for (const section of NOT_FROM_PROJECT) {
      if (this.own[section] === undefined) continue;
      delete this.own[section];
      log.warn(`${PROJECT_SETTINGS}: раздел ${section} проектным не бывает (ADR-0214) — пропускаю`);
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
