import { activate, configSection, plugin, type Ide } from '@mosetta/ide-api/client';
import { DAEMON_DEFAULTS, DAEMON_SCHEMA } from './settings.js';
import { DaemonIcon } from './icon.js';

/**
 * What the IDE costs in memory — a plugin of its own.
 *
 * It used to live in the toolbar, and that was a placement mistake: the toolbar is a
 * STRIP, a place where neighbours put their badges. "How much the daemon holds and what
 * its subprocesses cost" is not a property of the strip but a feature of its own, with
 * its own setting, its own icon and its own future (a graph, a history, "who exactly
 * ate it"). Sharing one file meant the toolbar could not be turned off without losing
 * the instrument along with it.
 *
 * The number arrives on the heartbeat and lives in the core next to `connected`: the
 * core knows it, whoever draws shows it. We sit between them: we take what is ready and
 * describe a badge.
 */
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

  /**
   * How much the daemon holds, and how much what it started holds.
   *
   * TWO numbers rather than one with the sum in a tooltip: there are two questions too
   * — "are we leaking" and "what does everything else cost" — and hiding the second
   * meant hiding precisely the larger one (341 against 2062 on this machine).
   *
   * The descendants may be no number at all — the system cannot be measured (Windows).
   * Then we show our own alone: a zero instead of an unknown would be a lie.
   *
   * A click leads to its own switch, as the sweep badge leads to its own budget. A
   * permanent figure on screen does not irritate everybody, but those it does irritate,
   * it irritates permanently.
   */
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

  /**
   * Lead to our own switch. Through the `settings.reveal` key rather than by importing
   * the settings plugin: the settings can be turned off, and the instrument must not
   * fall over for it. No entry means the click does nothing.
   */
  private revealSetting(): void {
    this.ide.registry<{ reveal(query: string): void }>('settings.reveal').all.value[0]?.reveal('memory');
  }
}
