import { activate, type Ide } from '@ide/api/client';
import NpmScripts from '@ide/plugin-npm-scripts';

export default class Rerun {
  private last: string | null = null;

  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    const npm = this.ide.getPlugin(NpmScripts);

    this.ide.command('scripts.rerun', () => {
      const id = this.last ?? npm.scripts()[0]?.id ?? null;
      if (!id) {
        this.ide.say(this.ide.t('rerun.nothing'));
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
