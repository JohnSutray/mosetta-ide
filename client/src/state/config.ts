import { signal } from '@preact/signals';
import type { ConfigBundle, Settings } from '@mosetta/ide-protocol';

/**
 * Settings arrive from the server and live there. The client keeps no copy on disk and
 * has no access to files — there is one source of truth.
 */
export class Config {
  readonly settings = signal<Settings | null>(null);
  /** Which config files were read: this is visible in the settings window. */
  readonly sources = signal<string[]>([]);
  /** What `settings.json` says, without defaults. */
  readonly user = signal<Record<string, Record<string, unknown>>>({});
  /** The defaults of the core sections; `null` until the first config arrives. */
  readonly defaults = signal<Settings | null>(null);
  /** What the project's `.mosetta/settings.json` says. */
  readonly project = signal<Record<string, Record<string, unknown>>>({});
  /**
   * Where it lives; `null` means there is no project and nowhere to write
   * project-scoped settings.
   */
  readonly projectFile = signal<string | null>(null);

  apply(bundle: ConfigBundle): void {
    this.settings.value = bundle.settings;
    this.sources.value = bundle.sources;
    this.user.value = bundle.user ?? {};
    this.defaults.value = bundle.defaults ?? null;
    this.project.value = bundle.project ?? {};
    this.projectFile.value = bundle.projectFile ?? null;
  }
}
