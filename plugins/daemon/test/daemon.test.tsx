import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHost } from '@mosetta/ide-api/testing';
import DaemonPlugin from '../src/client.js';

/**
 * The memory badge: how much the daemon holds, and how much what it started holds.
 *
 * The number arrives on the heartbeat and lives in the core next to `connected` — we
 * only describe it. So the test puts it into a fake core and looks at the badge's
 * DESCRIPTION: the toolbar draws it, and checking the markup here would mean checking
 * somebody else's work.
 */

const NAME = '@mosetta/ide-plugin-daemon';

interface Chip {
  text: unknown;
  more?: unknown;
  tip: string;
  onClick?: () => void;
}

describe('the daemon memory badge', () => {
  let host: FakeHost;

  beforeEach(async () => {
    host = new FakeHost();
    host.add(DaemonPlugin, NAME);
    await host.start();
  });

  function widget(): { id: string; side: string; chip: () => Chip | null } | undefined {
    return host.registry
      .all<{ id: string; side: string; chip: () => Chip | null }>('toolbar.widget')
      .find((one) => one.id === 'daemon');
  }

  it('asks for a place on the right of the toolbar', () => {
    expect(widget()?.side).toBe('right');
  });

  it('there has been no heartbeat yet — it stays silent', () => {
    expect(widget()!.chip()).toBeNull();
  });

  it('shows two numbers: itself and its descendants', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    const chip = widget()!.chip()!;
    expect(chip.text).toBe('412');
    expect(chip.more).toBe('daemon.size(rss=2048)');
  });

  it('the system cannot be measured — one number, and the unit with it', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: null };
    const chip = widget()!.chip()!;
    expect(chip.text).toBe('daemon.size(rss=412)');
    expect(chip.more).toBeUndefined();
  });

  it('the badge has a tooltip: the numbers mean nothing by themselves', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    expect(widget()!.chip()!.tip).toContain('daemon.aboutKids');
  });

  it('a setting switches the badge off entirely', () => {
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };
    expect(widget()!.chip()).not.toBeNull();
    host.ide(NAME).settings.value = { daemon: { memory: false } } as never;
    expect(widget()!.chip()).toBeNull();
  });

  it('a click leads to its own switch', () => {
    const asked: string[] = [];
    host.registry.add('settings.reveal', { id: 'settings', reveal: (q: string) => asked.push(q) }, '@mosetta/ide-plugin-settings');
    host.surface.daemon.value = { rssMb: 412, kidsMb: 2048 };

    widget()!.chip()!.onClick!();
    expect(asked).toEqual(['memory']);
  });
});
