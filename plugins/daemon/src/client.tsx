import { activate, configSection, plugin, type Ide } from '@mosetta/ide-api/client';
import { DAEMON_DEFAULTS, DAEMON_SCHEMA } from './settings.js';
import { DaemonIcon } from './icon.js';

@configSection({ section: 'daemon', defaults: DAEMON_DEFAULTS, schema: DAEMON_SCHEMA })
@plugin({ title: 'plugin.daemon' })
export default class DaemonPlugin {
  constructor(private readonly ide: Ide) {}

  @activate() protected start(): void {
    this.ide.registry('toolbar.widget').add({
      id: 'daemon',
      side: 'right',
      chip: () => this.chip(),
    });
  }

  private chip() {
    if (!this.ide.settingsOf('daemon', DAEMON_DEFAULTS).value.memory) return null;
    const said = this.ide.daemon.value;
    if (!said) return null;

    return {
      icon: <DaemonIcon />,
      tip: this.ide.t(said.kidsMb === null ? 'daemon.about' : 'daemon.aboutKids', {
        rss: said.rssMb,
        kids: said.kidsMb ?? 0,
        all: said.rssMb + (said.kidsMb ?? 0),
      }),
      text: said.kidsMb === null ? this.ide.t('daemon.size', { rss: said.rssMb }) : String(said.rssMb),
      ...(said.kidsMb === null ? {} : { more: this.ide.t('daemon.size', { rss: said.kidsMb }) }),
      onClick: () => this.revealSetting(),
    };
  }

  private revealSetting(): void {
    this.ide.registry<{ reveal(query: string): void }>('settings.reveal').all.value[0]?.reveal('memory');
  }
}
