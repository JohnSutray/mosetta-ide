import { Plugin } from '@ide/api/client';
import NpmScripts from '@ide/plugin-npm-scripts';

export default class Rerun extends Plugin {
  private last: string | null = null;

  override activate(): void {
    const npm = this.getPlugin(NpmScripts);

    this.command('scripts.rerun', 'Перезапустить последний скрипт', () => {
      const id = this.last ?? npm.scripts()[0]?.id ?? null;
      if (!id) {
        this.say('нечего перезапускать — сперва запусти скрипт');
        return;
      }
      this.last = id;
      void npm.run(id);
    });
  }

  remember(id: string): void {
    this.last = id;
  }
}
