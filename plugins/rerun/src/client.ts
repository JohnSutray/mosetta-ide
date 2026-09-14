import { command, plugin, type Ide } from '@mosetta/ide-api/client';
import NpmScripts from '@mosetta/ide-plugin-npm-scripts';

@plugin({ title: 'plugin.rerun' })
export default class Rerun {
  private last: string | null = null;

  constructor(private readonly ide: Ide) {}

  @command('scripts.rerun')
  protected rerun(): void {
    const npm = this.ide.getPlugin(NpmScripts);
    const id = this.last ?? npm.scripts()[0]?.id ?? null;
    if (!id) {
      this.ide.say(this.ide.t('rerun.nothing'));
      return;
    }
    this.last = id;
    void npm.run(id);
  }

  remember(id: string): void {
    this.last = id;
  }
}
